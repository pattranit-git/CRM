# Dockerfile - สร้าง Docker image สำหรับ CRM App

# ── Stage 1: Base Image ──────────────────────────────────────
# ใช้ Node.js 20 บน Alpine Linux (ขนาดเล็ก ~5MB)
FROM node:20-alpine

# กำหนด working directory ใน container
WORKDIR /app

# ── Stage 2: Install Dependencies ───────────────────────────
# Copy package.json ก่อน (ใช้ Docker cache layer ได้)
COPY package*.json ./

# ติดตั้ง dependencies (production only)
RUN npm install --omit=dev

# ── Stage 3: Copy Source Code ────────────────────────────────
# Copy ไฟล์ทั้งหมดเข้า container
COPY . .

# ── Stage 4: Configuration ───────────────────────────────────
# เปิด port 3000 (ต้อง map กับ -p ตอน docker run)
EXPOSE 3000

# กำหนด environment variable default
ENV NODE_ENV=production

# ── Stage 5: Run ─────────────────────────────────────────────
# คำสั่งรัน server เมื่อ container เริ่มทำงาน
CMD ["node", "server.js"]

# ── How to use ───────────────────────────────────────────────
# Build:  docker build -t crm-app .
# Run:    docker run -p 3000:3000 --env-file .env crm-app
