FROM node:20-alpine3.21
RUN apk --no-cache upgrade
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "app.js"]

