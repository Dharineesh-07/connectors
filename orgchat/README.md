# OrgChat

An internal messaging and calling platform for IT organizations. Supports real-time text chat, file sharing, audio/video calls (WebRTC), push notifications, and an admin console — available as a web app and a React Native mobile app.

---

## Table of Contents

- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start (Docker)](#quick-start-docker)
- [Local Development](#local-development)
  - [Backend](#backend)
  - [Web](#web)
  - [Mobile](#mobile)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [WebSocket Events](#websocket-events)
- [Seed Data](#seed-data)
- [Features](#features)

---

## Architecture

```
┌─────────────┐     HTTPS / WSS      ┌─────────────────────────────────────┐
│  Web App    │ ──────────────────►  │           nginx (port 80)           │
│  (React 18) │                      │  /api/*  → backend:8000             │
└─────────────┘                      │  /ws/*   → backend:8000 (WS)        │
                                     │  /*      → React SPA (index.html)   │
┌─────────────┐     HTTP / WS        └──────────────┬──────────────────────┘
│ Mobile App  │ ──────────────────►                 │
│ (RN/Expo)   │  direct to :8000                    ▼
└─────────────┘              ┌──────────────────────────────┐
                             │   FastAPI backend (port 8000) │
                             │   uvicorn · 2 workers         │
                             └───────────┬──────────────────┘
                                         │
                          ┌──────────────┼──────────────┐
                          ▼              ▼              ▼
                    ┌──────────┐  ┌──────────┐  ┌──────────┐
                    │ MySQL 8  │  │ Redis 7  │  │ S3 / disk│
                    │ (data)   │  │ (JWT     │  │ (uploads)│
                    └──────────┘  │  deny-   │  └──────────┘
                                  │  list /  │
                                  │  pub-sub)│
                                  └──────────┘
```

---

## Tech Stack

### Backend
| Layer | Technology |
|---|---|
| Framework | FastAPI 0.111 |
| ASGI server | Uvicorn with `uvloop` |
| ORM | SQLAlchemy 2 (async) |
| Database | MySQL 8 via `aiomysql` |
| Migrations | Alembic 1.13 |
| Cache / pub-sub | Redis 7 via `redis-py` |
| Auth | JWT (python-jose) + bcrypt (passlib) |
| Real-time | Native WebSocket (`fastapi.WebSocket`) |
| File storage | AWS S3 (boto3) or local disk |
| Schema validation | Pydantic v2 |

### Web
| Layer | Technology |
|---|---|
| Framework | React 18 + Vite 5 |
| Routing | React Router v6 |
| Styling | TailwindCSS 3 |
| Server state | React Query v3 |
| Real-time | Native `WebSocket` |
| WebRTC | Browser `RTCPeerConnection` API |
| Toasts | react-hot-toast |

### Mobile
| Layer | Technology |
|---|---|
| Framework | React Native 0.74 + Expo 51 |
| Navigation | React Navigation 6 (Stack + BottomTabs) |
| Secure storage | expo-secure-store |
| Real-time | Native WebSocket |
| WebRTC | react-native-webrtc |
| Push notifications | expo-notifications |
| Chat UI | react-native-gifted-chat |

---

## Project Structure

```
orgchat/
├── docker-compose.yml          # Full-stack orchestration
├── .env.example                # Root environment template
│
├── backend/
│   ├── Dockerfile
│   ├── entrypoint.sh           # Runs migrations then starts uvicorn
│   ├── alembic.ini
│   ├── seed.py                 # Creates admin + 3 employees + group chat
│   ├── requirements.txt
│   ├── .env.example
│   ├── alembic/
│   │   ├── env.py              # Async migration runner
│   │   └── versions/
│   │       └── 0001_initial.py # Full schema creation
│   └── app/
│       ├── main.py             # FastAPI app, lifespan, middleware
│       ├── config.py           # Pydantic settings (reads .env)
│       ├── database.py         # Async engine + session factory
│       ├── dependencies.py     # get_db, get_current_user, require_admin
│       ├── models/             # SQLAlchemy ORM models
│       │   ├── user.py
│       │   ├── conversation.py
│       │   ├── message.py
│       │   ├── call.py
│       │   ├── notification.py
│       │   └── audit_log.py
│       ├── schemas/            # Pydantic v2 request/response schemas
│       │   ├── auth.py
│       │   ├── user.py
│       │   ├── conversation.py
│       │   ├── message.py
│       │   ├── call.py
│       │   ├── admin.py
│       │   └── websocket.py
│       ├── routers/            # FastAPI route handlers
│       │   ├── auth.py
│       │   ├── users.py
│       │   ├── conversations.py
│       │   ├── messages.py
│       │   ├── calls.py
│       │   ├── admin.py
│       │   └── websocket.py
│       ├── services/           # Business logic
│       │   ├── auth_service.py
│       │   ├── user_service.py
│       │   ├── message_service.py
│       │   ├── call_service.py
│       │   └── notification_service.py
│       ├── middleware/
│       │   └── rate_limiter.py # Per-IP Redis sliding-window rate limiter
│       └── utils/
│           ├── jwt.py          # Token creation, verification, Redis deny-list
│           ├── password.py     # bcrypt hash + strength validation
│           └── file_upload.py  # S3 / local disk upload handler
│
├── web/
│   ├── Dockerfile              # Multi-stage: node build → nginx serve
│   ├── nginx.conf              # SPA fallback + /api /ws /uploads proxies
│   ├── vite.config.js          # Dev proxy to localhost:8000
│   ├── tailwind.config.js
│   └── src/
│       ├── main.jsx            # Providers: QueryClient, Auth, Socket, Call
│       ├── App.jsx             # createBrowserRouter + RequireAuth/Admin guards
│       ├── api/                # Axios modules (auth, users, conversations, …)
│       ├── context/            # AuthContext, SocketContext, CallContext
│       ├── hooks/              # useWebRTC, useMessages, useOnlineUsers
│       ├── components/         # Sidebar, MessageBubble, CallOverlay, …
│       └── pages/              # Login, Dashboard, Chat, admin/*
│
└── mobile/
    ├── App.js                  # Root: providers + notification listeners
    ├── app.json                # Expo config (bundle IDs, splash, plugins)
    ├── package.json
    └── src/
        ├── api/                # Axios modules (same shape as web)
        │   └── config.js       # BACKEND_HOST — edit before running on device
        ├── context/            # AuthContext, SocketContext, CallContext
        ├── hooks/              # useWebRTC (react-native-webrtc)
        ├── navigation/         # AppNavigator (Stack + BottomTabs), navigationRef
        ├── screens/            # Login, ConversationList, Chat, Call, Profile
        ├── components/         # UserAvatar, IncomingCallModal
        └── utils/              # notifications.js (Expo push token registration)
```

---

## Quick Start (Docker)

**Prerequisites:** Docker 24+ and Docker Compose v2.

```bash
git clone <repo-url> orgchat
cd orgchat

# 1. Configure environment
cp .env.example .env
#    Edit .env — set SECRET_KEY, COMPANY_EMAIL_DOMAIN, MYSQL_ROOT_PASSWORD

# 2. Build and start all services
docker compose up --build -d

# 3. Seed the database (first run only)
docker compose exec backend python seed.py
```

The web app will be available at **http://localhost**.  
The backend API and docs are at **http://localhost:8000/docs**.

To stop:
```bash
docker compose down
```

To wipe all data (volumes):
```bash
docker compose down -v
```

---

## Local Development

### Backend

**Prerequisites:** Python 3.11+, MySQL 8, Redis 7.

```bash
cd orgchat/backend

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL, REDIS_URL, SECRET_KEY, COMPANY_EMAIL_DOMAIN

# Run migrations
alembic upgrade head

# Seed initial data (optional)
python seed.py

# Start the development server
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### Web

**Prerequisites:** Node.js 20+.

```bash
cd orgchat/web
npm install
npm run dev
```

App: http://localhost:3000 (proxies `/api` and `/ws` to `localhost:8000`).

### Mobile

**Prerequisites:** Node.js 20+, Expo CLI, Android Studio or Xcode.

```bash
cd orgchat/mobile
npm install
```

Edit `src/api/config.js` and set `BACKEND_HOST` to your machine's LAN IP (the emulator/device must reach the backend):

```js
export const BACKEND_HOST = '192.168.1.100:8000'
```

```bash
# iOS simulator
npm run ios

# Android emulator
npm run android

# Expo Go (scan QR)
npm start
```

> **Note:** `react-native-webrtc` requires a development build (`expo run:ios` / `expo run:android`). It does not work inside Expo Go.

---

## Environment Variables

All variables are read by the backend from `.env` (or Docker environment). Docker Compose also reads the root `.env` for `MYSQL_ROOT_PASSWORD` and secrets.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | SQLAlchemy async URL, e.g. `mysql+aiomysql://user:pass@host:3306/orgchat` |
| `REDIS_URL` | Yes | — | Redis connection URL, e.g. `redis://localhost:6379` |
| `SECRET_KEY` | Yes | — | Long random string for JWT signing |
| `ALGORITHM` | No | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `15` | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | No | `7` | Refresh token lifetime |
| `COMPANY_EMAIL_DOMAIN` | Yes | — | Only emails `@this-domain` may register |
| `MAX_FILE_SIZE_MB` | No | `10` | Upload size limit |
| `S3_BUCKET` | No | `""` | S3 bucket name (leave empty for local disk) |
| `S3_ACCESS_KEY` | No | `""` | AWS access key |
| `S3_SECRET_KEY` | No | `""` | AWS secret key |
| `S3_REGION` | No | `us-east-1` | AWS region |
| `TURN_SERVER_URL` | No | `""` | Coturn URL, e.g. `turn:turn.example.com:3478` |
| `TURN_USERNAME` | No | `""` | TURN username |
| `TURN_CREDENTIAL` | No | `""` | TURN credential |
| `CORS_ORIGINS` | No | `http://localhost:3000,...` | Comma-separated allowed origins |

---

## Database Schema

```
users
  id · email · password_hash · full_name · display_name · avatar_url
  role (admin|employee) · department · phone_number
  is_active · is_online · last_seen · created_at · updated_at · created_by→users

conversations
  id · type (direct|group) · name · avatar_url · created_by→users · created_at

conversation_members
  id · conversation_id→conversations · user_id→users
  role (admin|member) · joined_at
  UNIQUE (conversation_id, user_id)

messages
  id · conversation_id→conversations · sender_id→users
  type (text|image|file|audio|video|call_log) · content
  file_url · file_name · file_size · reply_to_id→messages
  is_edited · is_deleted · created_at · updated_at

message_receipts
  id · message_id→messages · user_id→users
  status (delivered|read) · timestamp

calls
  id · conversation_id→conversations · initiated_by→users
  type (audio|video) · status (initiated|ongoing|ended|missed)
  started_at · ended_at · duration_seconds

call_participants
  id · call_id→calls · user_id→users
  joined_at · left_at · status (joined|left|missed)

notifications
  id · user_id→users · type · title · content · data (JSON)
  is_read · created_at

admin_logs
  id · admin_id→users · action · target_user_id→users
  details (JSON) · created_at
```

---

## API Reference

All endpoints are prefixed with `/api`. Authentication uses `Authorization: Bearer <access_token>`.

### Auth — `/api/auth`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | Admin only | Create a new user account |
| POST | `/auth/login` | — | Returns access + refresh tokens |
| POST | `/auth/refresh` | — | Exchange refresh token for new pair |
| POST | `/auth/logout` | User | Invalidates the current refresh token |

### Users — `/api/users`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users/me` | User | Current user profile |
| PATCH | `/users/me` | User | Update display name / avatar |
| POST | `/users/change-password` | User | Change own password |
| POST | `/users/fcm-token` | User | Register Expo push token |
| GET | `/users` | User | List all users (for directory / new DM) |

### Conversations — `/api/conversations`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/conversations` | User | List conversations with unread counts |
| POST | `/conversations` | User | Create direct or group conversation |
| GET | `/conversations/{id}` | Member | Conversation detail + members |
| POST | `/conversations/{id}/members` | Admin | Add member |
| DELETE | `/conversations/{id}/members/{uid}` | Admin | Remove member |

### Messages — `/api/messages`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/messages/{conversation_id}` | Member | Paginated messages (cursor-based, oldest-first) |
| POST | `/messages/{conversation_id}` | Member | Send a message |
| PUT | `/messages/{message_id}` | Sender | Edit message content |
| DELETE | `/messages/{message_id}` | Sender / Admin | Soft-delete message |
| POST | `/messages/{message_id}/read` | Member | Mark message as read |
| POST | `/messages/upload` | Member | Upload file; returns `{file_url, file_name, file_size}` |

### Calls — `/api/calls`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/calls/initiate` | Member | Start a call; returns `{call_id, turn_credentials}` |
| POST | `/calls/{id}/join` | Member | Join call; returns `{turn_credentials}` |
| POST | `/calls/{id}/leave` | Participant | Leave / end the call |
| GET | `/calls/history` | User | Paginated call log |

### Admin — `/api/admin`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/admin/stats` | Admin | User / message / call counts |
| GET | `/admin/users` | Admin | All users with filters |
| PATCH | `/admin/users/{id}/toggle-active` | Admin | Enable / disable account |
| POST | `/admin/users/{id}/reset-password` | Admin | Force password reset |
| POST | `/admin/broadcast` | Admin | Send system message to all users |
| GET | `/admin/audit-logs` | Admin | Paginated admin action log |

### WebSocket — `/ws/connect?token=<access_token>`

---

## WebSocket Events

The backend uses a single persistent connection per client. Messages are JSON with `{type, data}`.

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `message:new` | Message object | New message in a conversation the user belongs to |
| `message:edited` | `{message_id, conversation_id, content}` | Message was edited |
| `message:deleted` | `{message_id, conversation_id}` | Message was soft-deleted |
| `message:typing` | `{conversation_id, user_id, is_typing}` | Typing indicator |
| `user:online` | `{user_id}` | User came online |
| `user:offline` | `{user_id}` | User went offline |
| `call:incoming` | `{call_id, caller, type, offer_sdp}` | Incoming WebRTC call |
| `call:answer` | `{call_id, answer_sdp}` | Callee answered |
| `call:ice` | `{call_id, candidate}` | ICE candidate exchange |
| `call:ended` | `{call_id}` | Call was terminated |
| `call:rejected` | `{call_id}` | Callee rejected the call |

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `message:typing` | `{conversation_id, is_typing}` | Broadcast typing state |
| `call:initiate` | `{call_id, conversation_id, type, offer_sdp}` | Send offer to callee |
| `call:answer` | `{call_id, answer_sdp}` | Send answer SDP to caller |
| `call:ice` | `{call_id, candidate}` | Send ICE candidate |
| `call:end` | `{call_id}` | Terminate call |
| `call:reject` | `{call_id}` | Reject incoming call |

---

## Seed Data

Run `python seed.py` (backend) or `docker compose exec backend python seed.py` after the first migration. It creates:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@<COMPANY_EMAIL_DOMAIN>` | `Admin@123` |
| Employee | `alice@<COMPANY_EMAIL_DOMAIN>` | `Alice@123` |
| Employee | `bob@<COMPANY_EMAIL_DOMAIN>` | `Bob@1234` |
| Employee | `carol@<COMPANY_EMAIL_DOMAIN>` | `Carol@123` |

A **Company Announcements** group conversation is created with all four members and a welcome message from the admin.

> Change all passwords after first login in a production environment.

---

## Features

- **Authentication** — JWT access + refresh tokens, bcrypt passwords, token deny-list via Redis, per-IP rate limiting
- **User management** — email-domain-restricted registration, roles (admin / employee), department, avatar
- **Conversations** — direct messages and group chats, unread counts, cursor-based message pagination
- **Real-time messaging** — WebSocket push, typing indicators, delivery / read receipts
- **File sharing** — image and file uploads stored on S3 or local disk, inline previews
- **Audio / video calls** — WebRTC peer-to-peer with TURN server support, mute, PiP local video
- **Push notifications** — Expo push token registration, notification-tap deep-link to conversation
- **Admin console** — stats dashboard, user enable/disable, force password reset, broadcast message, audit log
- **Dark theme** — consistent slate-900 palette across web and mobile
