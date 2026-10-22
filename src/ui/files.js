// Граница с файлами браузера: изображение → подложка, файл → текст, данные → скачивание.

export async function loadBackdrop(src, name) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  try {
    await img.decode();
  } catch {
    return { ok: false, code: 'not_an_image', detail: { name } };
  }
  if (!img.naturalWidth || !img.naturalHeight) return { ok: false, code: 'not_an_image', detail: { name } };
  return { ok: true, value: { name, width: img.naturalWidth, height: img.naturalHeight, source: img } };
}

export function isImageFile(file) {
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(file.name);
}

export function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function baseName(name) {
  return (name || 'markup').replace(/\.[^.]+$/, '');
}
