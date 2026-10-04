FROM node:20-bookworm-slim

# ffmpeg + ffprobe untuk transcode & probe durasi/poster
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY index.js ./

ENV NODE_ENV=production
# PORT di-inject Railway; default 8080 kalau lokal
EXPOSE 8080
CMD ["node", "index.js"]
