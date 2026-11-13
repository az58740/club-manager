import { M, tr } from "./i18n/messages";

export async function fileToSquareDataUrl(file: File, size = 256): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(tr(M.image.readFailed)));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error(tr(M.image.invalidFile)));
    element.src = raw;
  });

  const side = Math.min(image.width, image.height);
  const offsetX = (image.width - side) / 2;
  const offsetY = (image.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return raw;

  context.drawImage(image, offsetX, offsetY, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.82);
}
