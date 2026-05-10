FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY server/package*.json ./server/
COPY shared/package*.json ./shared/
RUN npm ci

# Copy source
COPY . .

# Generate Prisma client & compile TypeScript
RUN cd server && npx prisma generate
RUN npm run build --workspace=server

# Push DB schema and start server
CMD cd server && npx prisma db push --accept-data-loss && node dist/index.js
