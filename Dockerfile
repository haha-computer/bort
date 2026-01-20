FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY bot.js ./
CMD ["node", "bot.js"]
