# TITUS-BOT Quantum Edition Dockerfile

FROM node:lts-bookworm

WORKDIR /app

COPY package*.json ./

RUN npm install

RUN apt-get update && \
    apt-get install -y ffmpeg imagemagick webp && \
    rm -rf /var/lib/apt/lists/*

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
