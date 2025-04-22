// src/lib/image-processor.ts
import { createCanvas, loadImage, Image } from 'canvas';

interface CompositeImageParams {
  leftImage: string;
  rightImage: string;
  logo?: string;
  leftPosition: { x: number; y: number };   // Pixel offset from preview
  rightPosition: { x: number; y: number };  // Pixel offset from preview
  logoPosition: { x: number; y: number };   // Percentage position (center X, center Y)
  leftZoom: number;                          // Percentage zoom
  rightZoom: number;                         // Percentage zoom
  logoZoom: number;                          // Percentage of TOTAL width for logo
}

const clamp = (num: number, min: number, max: number): number => Math.min(Math.max(num, min), max);

export async function processCompositeImage(params: CompositeImageParams): Promise<Buffer> {
  const {
    leftImage, rightImage, logo,
    leftPosition, rightPosition, logoPosition,
    leftZoom, rightZoom, logoZoom // logoZoom is now percentage
  } = params;

  console.log("--- Processing Image ---");
  console.log("Received Params:", {
    ...params,
    leftImage: leftImage.substring(0, 50) + "...", // Avoid logging full base64
    rightImage: rightImage.substring(0, 50) + "...",
    logo: logo ? logo.substring(0, 50) + "..." : undefined,
   });


  try {
    const leftImageData = leftImage.replace(/^data:image\/\w+;base64,/, '');
    const rightImageData = rightImage.replace(/^data:image\/\w+;base64,/, '');

    const leftImg = await loadImage(Buffer.from(leftImageData, 'base64'));
    const rightImg = await loadImage(Buffer.from(rightImageData, 'base64'));
    console.log(`Left Image Loaded: ${leftImg.width}x${leftImg.height}`);
    console.log(`Right Image Loaded: ${rightImg.width}x${rightImg.height}`);


    // --- Define Final Canvas Dimensions ---
    const finalWidth = 1920; // Consistent high-resolution output width
    // Maintain aspect ratio of the source images within their halves
    const leftTargetHeight = (finalWidth / 2) * (leftImg.height / leftImg.width);
    const rightTargetHeight = (finalWidth / 2) * (rightImg.height / rightImg.width);
    // Use the MAX height needed to ensure neither image is cut off vertically by the canvas itself
    const finalHeight = Math.ceil(Math.max(leftTargetHeight, rightTargetHeight));
    console.log(`Final Canvas Dimensions: ${finalWidth}x${finalHeight}`);

    const canvas = createCanvas(finalWidth, finalHeight);
    const ctx = canvas.getContext('2d');

    // Optional: Fill background if images might not cover fully
    ctx.fillStyle = '#ffffff'; // White background
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // --- REVISED Drawing Function with Robust Clipping ---
    const drawFinalImageSection = (
      img: Image,                  // Source image object
      section: 'left' | 'right', // Which half of the canvas
      zoomPercent: number,         // Frontend zoom % (e.g., 150)
      panOffset: { x: number; y: number } // Frontend pixel offset (e.g., { x: 10, y: -20 })
    ) => {
      const scale = zoomPercent / 100; // e.g., 1.5

      // Destination rectangle on the final canvas
      const dWidth = finalWidth / 2; // Width of this section
      const dHeight = finalHeight;   // Full height of the canvas
      const dx = section === 'left' ? 0 : dWidth; // X position on canvas
      const dy = 0;                   // Y position on canvas

      // Calculate the initial source rectangle (sx, sy, sWidth, sHeight) from the original image
      // This rectangle, when scaled by `scale`, should cover the destination rectangle `dWidth, dHeight`
      let sWidth = dWidth / scale;
      let sHeight = dHeight / scale;

      // Calculate the source top-left (sx, sy) based on the pan offset.
      // A positive panOffset.x (panned right in preview) means we need to sample
      // *more to the left* in the source image relative to the default centered view.
      // Default centered sx = (img.width / 2) - (sWidth / 2)
      // The panOffset is relative to the top-left corner of the scaled image container.
      // sx = Default centered sx - (panOffset.x / scale)
      // sx = (img.width - sWidth) / 2 - (panOffset.x / scale); // Center based calculation (less direct)

      // Let's use the direct top-left approach from the preview:
      // panOffset.x = 0 means the top-left of the scaled image aligns with the top-left of the container.
      // The source coordinate corresponding to the container's top-left (dx=0 or dx=dWidth) is -panOffset / scale.
      let sx = -panOffset.x / scale;
      let sy = -panOffset.y / scale;


      console.log(`[${section}] Initial Calc: scale=${scale.toFixed(2)}, sW=${sWidth.toFixed(2)}, sH=${sHeight.toFixed(2)}, sx=${sx.toFixed(2)}, sy=${sy.toFixed(2)}`);
      console.log(`[${section}] Pan Offset: x=${panOffset.x}, y=${panOffset.y}`);

      // --- Robust Clipping ---
      // Find the intersection of the calculated source rectangle [sx, sy, sWidth, sHeight]
      // and the actual image bounds [0, 0, img.width, img.height].

      const clipSx = Math.max(0, sx);
      const clipSy = Math.max(0, sy);

      const clipEx = Math.min(img.width, sx + sWidth); // End X of source rect, clamped to image width
      const clipEy = Math.min(img.height, sy + sHeight); // End Y of source rect, clamped to image height

      const clipSWidth = Math.max(0, clipEx - clipSx); // Clipped source width
      const clipSHeight = Math.max(0, clipEy - clipSy); // Clipped source height


      // Calculate the destination rectangle (clipDx, clipDy, clipDWidth, clipDHeight)
      // corresponding to the clipped source rectangle.

      // The destination width/height is simply the clipped source width/height scaled up.
      const clipDWidth = clipSWidth * scale;
      const clipDHeight = clipSHeight * scale;

      // The destination top-left (clipDx, clipDy) needs adjustment based on how much
      // the source was clipped *from the left and top*.
      // If sx was < 0, clipSx became 0. The difference (clipSx - sx) is how much we shifted right in the source.
      // This shift, scaled up, determines how much further right we start drawing on the destination canvas.
      const clipDx = dx + (clipSx - sx) * scale;
      const clipDy = dy + (clipSy - sy) * scale;

      console.log(`[${section}] Clipped Source: sx=${clipSx.toFixed(2)}, sy=${clipSy.toFixed(2)}, sW=${clipSWidth.toFixed(2)}, sH=${clipSHeight.toFixed(2)}`);
      console.log(`[${section}] Clipped Dest: dx=${clipDx.toFixed(2)}, dy=${clipDy.toFixed(2)}, dW=${clipDWidth.toFixed(2)}, dH=${clipDHeight.toFixed(2)}`);

      // Draw the clipped portion
      if (clipSWidth > 0 && clipSHeight > 0 && clipDWidth > 0 && clipDHeight > 0) {
        ctx.drawImage(
          img,
          clipSx, clipSy, clipSWidth, clipSHeight, // Source rect (clipped region of original img)
          clipDx, clipDy, clipDWidth, clipDHeight  // Destination rect on canvas
        );
         console.log(`[${section}] DrawImage executed.`);
      } else {
         console.warn(`[${section}] Skipping draw due to zero dimensions after clipping.`);
      }
    };

    // --- Draw Sections ---
    console.log("\nDrawing Left Section...");
    drawFinalImageSection(leftImg, 'left', leftZoom, leftPosition);
    console.log("\nDrawing Right Section...");
    drawFinalImageSection(rightImg, 'right', rightZoom, rightPosition);

    // --- Draw Logo ---
    if (logo) {
      console.log("\nDrawing Logo...");
      try {
        const logoData = logo.replace(/^data:image\/\w+;base64,/, '');
        const logoImg = await loadImage(Buffer.from(logoData, 'base64'));
        console.log(`Logo Loaded: ${logoImg.width}x${logoImg.height}`);

        // CHANGE: Calculate target logo width based on percentage of FINAL canvas width
        const targetLogoWidth = (finalWidth * logoZoom) / 100;
        const logoAspectRatio = logoImg.height / logoImg.width;
        const targetLogoHeight = targetLogoWidth * (isNaN(logoAspectRatio) ? 1 : logoAspectRatio);

        console.log(`Target Logo Size (%=${logoZoom}): ${targetLogoWidth.toFixed(2)}x${targetLogoHeight.toFixed(2)}`);

        // Calculate position based on percentage of final canvas dimensions
        // logoPosition x/y still refers to the desired CENTER of the logo
        const logoCenterX = (finalWidth * logoPosition.x) / 100;
        const logoCenterY = (finalHeight * logoPosition.y) / 100;

        // Calculate top-left corner for drawing
        let logoDrawX = logoCenterX - targetLogoWidth / 2;
        let logoDrawY = logoCenterY - targetLogoHeight / 2;

        // Clamp logo position to ensure it stays fully within the canvas bounds
        logoDrawX = clamp(logoDrawX, 0, finalWidth - targetLogoWidth);
        logoDrawY = clamp(logoDrawY, 0, finalHeight - targetLogoHeight);

        console.log(`Final Logo Draw Position (Top-Left): x=${logoDrawX.toFixed(2)}, y=${logoDrawY.toFixed(2)}`);

        ctx.drawImage(logoImg, logoDrawX, logoDrawY, targetLogoWidth, targetLogoHeight);
        console.log("Logo Drawn Successfully.");

      } catch (logoError) {
        // ... (error handling remains the same) ...
         const logoErrorMessage = logoError instanceof Error ? logoError.message : String(logoError);
         console.error("Error loading or drawing logo:", logoErrorMessage);
         if (logoError instanceof Error) {
             console.error("Logo Error Stack:", logoError.stack);
         }
      }
    }

    console.log("\n--- Image Processing Complete ---");
    return canvas.toBuffer('image/png');

  } catch (error) {
      // ... (error handling remains the same) ...
      console.error("--- Error in processCompositeImage ---");
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Error Message:", errorMessage);
      if (error instanceof Error) {
          console.error("Error Stack:", error.stack);
      } else {
          console.error("Caught error object:", error);
      }
      console.error("Processing Params (abbreviated):", {
        ...params,
        leftImage: leftImage.substring(0, 50) + "...",
        rightImage: rightImage.substring(0, 50) + "...",
        logo: logo ? logo.substring(0, 50) + "..." : undefined,
       });
      throw new Error(`Image processing failed: ${errorMessage}`);
  }
}