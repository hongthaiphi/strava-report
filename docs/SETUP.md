# Hướng dẫn cài đặt Strava Report

## 1. Tạo Strava API Application

1. Truy cập https://www.strava.com/settings/api
2. Tạo app mới với:
   - **Application Name**: TCBS Running Club
   - **Website**: URL Vercel của bạn (hoặc `http://localhost:3000` khi dev)
   - **Authorization Callback Domain**: domain Vercel (hoặc `localhost`)
3. Lưu lại **Client ID** và **Client Secret**

## 2. Lấy Club ID

- Vào trang club trên Strava: `https://www.strava.com/clubs/<tên-club>`
- Club ID là số trong URL, ví dụ: `https://www.strava.com/clubs/123456` → ID là `123456`

## 3. Tạo Supabase project

1. Vào https://supabase.com → tạo project mới
2. Vào **SQL Editor** → paste nội dung file [`docs/supabase-schema.sql`](supabase-schema.sql) → **Run**
3. Vào **Project Settings → API** → lấy **Project URL** và **anon public key**

## 4. Cấu hình môi trường

```bash
cp .env.example .env
```

Sửa file `.env` (dùng khi chạy local):

```env
STRAVA_CLIENT_ID=123456
STRAVA_CLIENT_SECRET=abc123...
STRAVA_CLUB_ID=789012
JWT_SECRET=random_string_dài_và_ngẫu_nhiên

SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
```

## 5. Chạy local

```bash
npm install
npm start
# hoặc dev mode (auto-reload):
npm run dev
```

Mở trình duyệt: http://localhost:3000

## 6. Deploy lên Vercel

```bash
npm i -g vercel
vercel
```

Sau khi deploy, thêm các environment variables trong **Vercel Dashboard → Project → Settings → Environment Variables**:

| Key | Value |
|-----|-------|
| `STRAVA_CLIENT_ID` | Client ID từ Strava |
| `STRAVA_CLIENT_SECRET` | Client Secret từ Strava |
| `STRAVA_CLUB_ID` | ID của club |
| `JWT_SECRET` | Chuỗi random dài |
| `SUPABASE_URL` | URL Supabase project |
| `SUPABASE_ANON_KEY` | Anon key Supabase |

Sau đó vào Strava API settings, cập nhật **Authorization Callback Domain** thành domain Vercel (ví dụ: `strava-report.vercel.app`).

## 7. Đăng nhập và sử dụng

1. Click **Kết nối với Strava** → Authorize
2. Dashboard tự động load dữ liệu từ Supabase (lần đầu sẽ tự sync từ Strava)
3. Click **Sync Strava** để kéo dữ liệu mới nhất về DB bất cứ lúc nào

## Lưu ý về Strava API

- Club Activities API chỉ trả về các hoạt động **gần nhất** (Strava giới hạn ~200 hoạt động/trang)
- Rate limit: 100 requests/15 phút, 1000 requests/ngày

## Cấu trúc project

```
strava-report/
├── src/
│   ├── server.js      # Express server + API routes
│   ├── strava.js      # Strava API helpers
│   └── db.js          # Supabase helpers (upsert, query)
├── public/
│   ├── index.html     # Frontend SPA
│   ├── style.css      # Styles
│   └── app.js         # Frontend logic + charts
├── docs/
│   ├── SETUP.md             # Tài liệu này
│   └── supabase-schema.sql  # SQL tạo bảng
├── vercel.json        # Cấu hình Vercel
├── .env.example       # Mẫu cấu hình
└── package.json
```
