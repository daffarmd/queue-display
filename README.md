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

- Operator: `operator / queue123`
- Admin: `admin / admin123`

## Real-time Mode

By default, real-time updates work via browser `BroadcastChannel` (cross-tab).

If you have a backend websocket/socket.io server, set:

```bash
PUBLIC_SOCKET_URL=http://localhost:3000
```

The display will show reconnecting status and retry every 3 seconds when disconnected.

