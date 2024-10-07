import * as nodeNet from 'node:net'
import { BackendError } from 'pg-gateway'
import { fromNodeSocket } from 'pg-gateway/node'
import { extractDatabaseId, isValidServername } from './servername.ts'
import { getTls } from './tls.ts'
import { createStartupMessage, createTerminateMessage } from './create-message.ts'
import { extractIP } from './extract-ip.ts'
import { logEvent, UserConnected, UserDisconnected } from './telemetry.ts'
import { connectionManager } from './connection-manager.ts'
import { debug as mainDebug } from './debug.ts'
import { getConnectionId, serialize } from './protocol.ts'
import { pgDumpMiddleware } from './pg-dump-middleware/pg-dump-middleware.ts'

const debug = mainDebug.extend('tcp-server')

// we need to use proxywrap to make our tcp server to enable the PROXY protocol support
const net = (
  process.env.PROXIED ? (await import('findhit-proxywrap')).default.proxy(nodeNet) : nodeNet
) as typeof nodeNet

export const tcpServer = net.createServer()

tcpServer.on('connection', async (socket) => {
  let connectionState: {
    databaseId: string
    connectionId: string
  } | null = null

  debug('new tcp connection')

  const connection = await fromNodeSocket(socket, {
    tls: getTls,
    onTlsUpgrade(state) {
      if (!state.tlsInfo?.serverName || !isValidServername(state.tlsInfo.serverName)) {
        throw BackendError.create({
          code: '08006',
          message: 'invalid SNI',
          severity: 'FATAL',
        })
      }

      const databaseId = extractDatabaseId(state.tlsInfo.serverName!)

      const websocket = connectionManager.getWebsocket(databaseId)

      if (!websocket) {
        throw BackendError.create({
          code: 'XX000',
          message: 'the browser is not sharing the database',
          severity: 'FATAL',
        })
      }

      if (connectionManager.hasSocketForDatabase(databaseId)) {
        throw BackendError.create({
          code: '53300',
          message: 'sorry, too many clients already',
          severity: 'FATAL',
        })
      }

      const connectionId = getConnectionId()
      connectionManager.setSocket(databaseId, connectionId, connection)

      connectionState = { databaseId, connectionId }

      logEvent(new UserConnected({ databaseId, connectionId }))

      const clientIpMessage = createStartupMessage('postgres', 'postgres', {
        client_ip: extractIP(socket.remoteAddress!),
      })
      websocket.send(serialize(connectionId, clientIpMessage))
    },
    serverVersion() {
      return '16.3'
    },
    onMessage(message, state) {
      if (!state.isAuthenticated) {
        return
      }

      const websocket = connectionManager.getWebsocket(connectionState!.databaseId)

      if (!websocket) {
        throw BackendError.create({
          code: 'XX000',
          message: 'the browser is not sharing the database',
          severity: 'FATAL',
        })
      }

      debug('tcp message: %e', () => Buffer.from(message).toString('hex'))
      message = pgDumpMiddleware.client(
        socket,
        connectionState!.connectionId,
        connection.state,
        Buffer.from(message)
      )
      websocket.send(serialize(connectionState!.connectionId, message))

      // return an empty buffer to indicate that the message has been handled
      return new Uint8Array()
    },
  })

  // 5 minutes idle timeout for the tcp connection
  socket.setTimeout(1000 * 60 * 5)
  socket.on('timeout', () => {
    debug('tcp connection timeout')
    if (connectionState) {
      const errorMessage = BackendError.create({
        code: '57P05',
        message: 'terminating connection due to idle timeout (5 minutes)',
        severity: 'FATAL',
      }).flush()
      connection.streamWriter?.write(errorMessage)
    }
    socket.end()
  })

  socket.on('close', () => {
    if (connectionState) {
      connectionManager.deleteSocketForDatabase(connectionState.databaseId)

      logEvent(
        new UserDisconnected({
          databaseId: connectionState.databaseId,
          connectionId: connectionState.connectionId,
        })
      )

      const websocket = connectionManager.getWebsocket(connectionState.databaseId)
      websocket?.send(serialize(connectionState.connectionId, createTerminateMessage()))
    }
  })
})
