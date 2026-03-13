# Dockerfile — Railway-ready CRM App

FROM node:20-alpine

WORKDIR /app

# ติดตั้ง dependencies ก่อน (cache layer)
COPY package*.json ./
RUN npm install --omit=dev

# Copy source code
COPY . .

# Railway inject PORT อัตโนมัติ ไม่ต้อง hardcode
EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "server.js"]
