import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// Vision models tile images internally at a few hundred px per tile — sending
// a raw phone photo (often 3000-4000px, several MB) wastes upload time and
// tokens without improving food-identification accuracy. Capping the longest
// edge at 1024px keeps enough detail to read a nutrition label while cutting
// a typical photo's base64 payload down dramatically (both the client→Edge
// Function upload and the Edge Function→OpenRouter forward benefit, since the
// same base64 string is used for both).
const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.7;

// Resizes+recompresses a picked photo before it's sent anywhere. Returns a new
// base64 string; the original picker result (uri, dimensions) is untouched.
export async function resizeForUpload(uri: string, width: number, height: number): Promise<string> {
  const longestEdge = Math.max(width, height);

  // Dimensions can be 0 if the OS didn't report them (rare, but documented in
  // expo-image-picker's types) — in that case still recompress, just skip the
  // resize step rather than risk an incorrect scale-down.
  const context = ImageManipulator.manipulate(uri);
  if (longestEdge > MAX_DIMENSION) {
    if (width >= height) {
      context.resize({ width: MAX_DIMENSION });
    } else {
      context.resize({ height: MAX_DIMENSION });
    }
  }

  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    base64: true,
    compress: JPEG_QUALITY,
    format: SaveFormat.JPEG,
  });

  return result.base64!;
}
