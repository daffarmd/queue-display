# Queue Display App

Digital Queue Display System built with:

- Svelte 5
- SvelteKit
- Tailwind CSS v4
- Socket.io client (optional backend connection)

## Quick Start

```bash
npm install
npm run dev
```

Open:

- `http://localhost:5173/display`
- `http://localhost:5173/operator`
- `http://localhost:5173/admin`
- `http://localhost:5173/queue/take`

## Demo Credentials

- Operator (per loket):
  - `op-loket-1 / queue123 / PIN 1001`
  - `op-loket-2 / queue123 / PIN 1002`
  - `op-loket-3 / queue123 / PIN 1003`
  - `op-loket-4 / queue123 / PIN 1004`
  - `op-loket-5 / queue123 / PIN 1005`
  - `op-loket-6 / queue123 / PIN 1006`
- Admin: `admin / admin123`

Optional secure operator route:

- `http://localhost:5173/operator/loket-3` (locks login flow to loket 3)

## Real-time Mode

By default, real-time updates work via browser `BroadcastChannel` (cross-tab).

If you have a backend websocket/socket.io server, set:

```bash
PUBLIC_SOCKET_URL=http://localhost:8081
PUBLIC_SOCKET_NAMESPACE=/queue
PUBLIC_SOCKET_BRANCH=main
```

The display will show reconnecting status and retry every 3 seconds when disconnected.

For the paired `queue-socket` service in this workspace, run the Go server on `:8081`.
