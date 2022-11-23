function xyToPixel(width, x, y) {
  return (y * width + x) * 4;
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function getSurroundingPixels(width, height, x, y) {
  const newX = clamp(x - 4, 0, width);
  const newY = clamp(y - 4, 0, height);

  const pixels = [];
  for (let i = 0; i < 9; i++) {
    for (let o = 0; o < 9; o++) {
      pixels.push(xyToPixel(width, newX + i, newY + o));
    }
  }
  return pixels;
}

function filter(imageData) {
  for (let x = 0; x < imageData.width; x++) {
    for (let y = 0; y < imageData.height; y++) {
      const i = xyToPixel(imageData.width, x, y);
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      const a = imageData.data[i + 3];
      if (g > 10 && g > r && g > b) {
        imageData.data[i + 3] = 255;

        getSurroundingPixels(imageData.width, imageData.height, x, y).forEach(
          (p) => {
            imageData.data[p + 3] = 255;
          }
        );
      } else {
        imageData.data[i + 3] = 100;
      }
    }
  }

  return imageData;
}

self.addEventListener("message", (event) => {
  if (event.data.type === "IMAGE_DATA") {
    const newData = filter(event.data.imageData);
    event.source.postMessage(newData);
  }
});

self.addEventListener("install", function (event) {
  event.waitUntil(self.skipWaiting()); // Activate worker immediately
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim()); // Become available to all pages
});
