FROM node:18-alpine

WORKDIR /app

COPY . .
RUN npm ci
RUN cd server && npx prisma generate
RUN npm run build --workspace=server

CMD cd server && npx prisma db push --accept-data-loss && node dist/server/src/index.js
