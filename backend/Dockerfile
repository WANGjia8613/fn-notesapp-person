FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build
RUN mkdir -p uploads

EXPOSE 3000
CMD ["node", "dist/index.js"]
