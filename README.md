# 💅 Nailuxe Studio Manager

Complete management system for a Nail Art Studio — web admin panel + Android staff app, powered by Supabase.

---

## Project Structure

```
Nailuxe Manager/
├── admin-panel/        ← React + TypeScript web admin panel
├── staff-app/          ← Flutter Android staff app
└── supabase/
    └── schema.sql      ← Full database schema with RLS policies
```

---

## ⚡ Quick Start

### Step 1 — Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a free project
2. Go to **SQL Editor** and run everything in `supabase/schema.sql`
3. Copy your **Project URL** and **Anon Key** from Settings → API

### Step 2 — Create Admin User

1. Supabase Dashboard → **Authentication → Users → Add user**
2. Enter email + password for the admin
3. Copy the new user's **UUID**
4. Run in SQL Editor:
   ```sql
   INSERT INTO public.staff (id, name, phone, joining_date, salary, role)
   VALUES ('PASTE-UUID-HERE', 'Admin Name', '+1234567890', '2024-01-01', 0, 'admin');
   ```

### Step 3 — Run the Admin Panel

```bash
cd admin-panel
cp .env.example .env
# Edit .env with your Supabase URL and anon key
npm install
npm run dev
```

Open `http://localhost:5173` and log in with the admin credentials.

### Step 4 — Add Staff Members

1. Log in as admin → go to **Staff** page → **Add Staff**
2. Fill in the form — this creates the staff profile record
3. Then go to Supabase Dashboard → Authentication → Users → Add user (use the same email)
4. Copy the new user's UUID and run:
   ```sql
   UPDATE public.staff SET id = 'NEW-AUTH-UUID' WHERE phone = 'STAFF-PHONE';
   ```
   *(Or create the staff record after creating the auth user using the UUID directly)*

### Step 5 — Build the Flutter App

1. Install Flutter: [flutter.dev/docs/get-started/install](https://flutter.dev/docs/get-started/install)
2. Set up Android Studio and an emulator / real device
3. Run:
   ```bash
   cd staff-app
   flutter pub get
   flutter run --dart-define=SUPABASE_URL=https://your-project.supabase.co \
               --dart-define=SUPABASE_ANON_KEY=your-anon-key
   ```

---

## Features

### 🖥️ Admin Panel (Web)
| Feature | Description |
|---|---|
| Dashboard | Today's revenue, customers, top staff, revenue chart |
| Staff Management | Add/edit/deactivate staff, view profiles |
| Customer Management | Customer list, visit history, search by name/phone |
| Services | Add/edit/categorize services with price & duration |
| Work Records | Filter by staff/date range, view all sessions |
| Reports | Monthly reports, staff performance, service breakdown — export PDF/Excel |
| Overtime | Auto-calculated from start/stop times, configurable standard hours |
| Settings | Studio info, working hours configuration |

### 📱 Staff App (Android)
| Feature | Description |
|---|---|
| Login | Secure email/password login |
| Dashboard | Today's revenue, customer count, session list |
| Add Work | Search existing customers or add new, select service, start/stop timer |
| My Work | Daily and monthly views with charts |
| Profile | Personal info, salary, monthly performance |

---

## Security (Row-Level Security)

| Table | Staff Access | Admin Access |
|---|---|---|
| `staff` | Own record only | Full CRUD |
| `customers` | Read + Insert | Full CRUD |
| `services` | Read only | Full CRUD |
| `work_records` | Own records only | All records |
| `overtime` | Own records only | All records |
| `settings` | Read only | Full CRUD |

---

## Technology Stack

| Layer | Technology |
|---|---|
| Web Frontend | React 18, TypeScript, Vite, Tailwind CSS v4 |
| Android App | Flutter 3, Dart, Riverpod |
| Backend & DB | Supabase (PostgreSQL + Auth + RLS + Storage) |
| State Management | TanStack Query (web), Riverpod (Flutter) |
| Charts | Recharts (web), fl_chart (Flutter) |
| Export | jsPDF + jspdf-autotable, SheetJS / xlsx |
| Navigation | React Router v6 (web), GoRouter (Flutter) |

---

## Environment Variables

**Admin Panel** (`.env`):
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

**Flutter App** (pass via `--dart-define`):
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

---

## Build for Production

**Admin Panel:**
```bash
cd admin-panel
npm run build
# Output in admin-panel/dist/ — deploy to Netlify, Vercel, etc.
```

**Android APK:**
```bash
cd staff-app
flutter build apk --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...
# APK at: build/app/outputs/flutter-apk/app-release.apk
```

---

## Supabase Storage Buckets

Two storage buckets are created automatically by `schema.sql`:
- `staff_photos` — staff profile images
- `work_photos` — photos of nail work

Staff can only access their own folder. Admins have full access.

---

## Support

For issues or feature requests, check the Supabase documentation at [supabase.com/docs](https://supabase.com/docs).
