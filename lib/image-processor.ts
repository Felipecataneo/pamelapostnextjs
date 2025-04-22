// src/lib/image-processor.ts
import { createCanvas, loadImage, Image } from 'canvas';

interface CompositeImageParams {
  leftImage: string;
  rightImage: string;
  logo?: string;
  leftPosition: { x: number; y: number }; // Pixel offset from preview
  rightPosition: { x: number; y: number }; // Pixel offset from preview
  logoPosition: { x: number; y: number }; // Percentage position
  leftZoom: number; // Percentage zoom
  rightZoom: number; // Percentage zoom
  logoZoom: number; // Pixel width for logo
}

const clamp = (num: number, min: number, max: number): number => Math.min(Math.max(num, min), max);

export async function processCompositeImage(params: CompositeImageParams): Promise<Buffer> {
  const {
    leftImage, rightImage, logo,
    leftPosition, rightPosition, logoPosition,
    leftZoom, rightZoom, logoZoom
  } = params;

  console.log("--- Processing Image ---");
  console.log("Received Params:", JSON.stringify(params, null, 2));

  try {
    const leftImageData = leftImage.replace(/^data:image\/\w+;base64,/, '');
    const rightImageData = rightImage.replace(/^data:image\/\w+;base64,/, '');

    const leftImg = await loadImage(Buffer.from(leftImageData, 'base64'));
    const rightImg = await loadImage(Buffer.from(rightImageData, 'base64'));
    console.log(`Left Image Loaded: ${leftImg.width}x${leftImg.height}`);
    console.log(`Right Image Loaded: ${rightImg.width}x${rightImg.height}`);


    // --- Define Final Canvas Dimensions ---
    // Let's maintain a consistent high-resolution output
    const finalWidth = 1920;
    // Calculate height to roughly match the taller aspect ratio when combined
    const leftExpectedH = (finalWidth / 2) * (leftImg.height / leftImg.width);
    const rightExpectedH = (finalWidth / 2) * (rightImg.height / rightImg.width);
    const finalHeight = Math.ceil(Math.max(leftExpectedH, rightExpectedH)); // Use ceil to avoid fractional pixels
    console.log(`Final Canvas Dimensions: ${finalWidth}x${finalHeight}`);

    const canvas = createCanvas(finalWidth, finalHeight);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // --- Revised Drawing Function ---
    const drawFinalImageSection = (
      img: Image,                  // The source image object
      section: 'left' | 'right', // Which section are we drawing?
      zoomPercent: number,         // Zoom level (e.g., 150)
      panOffset: { x: number; y: number } // Pixel offset from frontend preview
    ) => {
      const scale = zoomPercent / 100;

      // Define the destination rectangle on the final canvas
      const dx = section === 'left' ? 0 : finalWidth / 2;
      const dy = 0;
      const dWidth = finalWidth / 2; // Each section takes half the width
      const dHeight = finalHeight;

      // Calculate the dimensions of the source rectangle needed from the original image
      // to fill the destination rectangle at the current scale.
      let sWidth = dWidth / scale;
      let sHeight = dHeight / scale;

      // Calculate the top-left source coordinates (sx, sy) in the original image.
      // This needs to account for the panning offset.
      // A positive panOffset.x means the image moved right in the preview,
      // so we need to sample further *right* in the source image.
      // sx = (Default Center X) + (Pan X adjusted for scale)
      // Default Center X is (img.width - sWidth) / 2
      // sx = (img.width / 2 - sWidth / 2) + panOffset.x / scale -> This assumes pan is relative to center. It's not.

      // Let's rethink: The panOffset is relative to the *container*.
      // If panOffset.x is 0, the left edge of the zoomed image aligns with the container edge.
      // If panOffset.x is positive (panned right), the left edge of the zoomed image is +panOffset.x pixels right.
      // We need the sx that corresponds to the container's left edge.
      // sx = (coordinate of container left edge in original image)
      // sx = (-panOffset.x / scale) <--- This is the key insight

      let sx = -panOffset.x / scale;
      let sy = -panOffset.y / scale;

      console.log(`[${section}] Initial Calc: scale=${scale.toFixed(2)}, sW=${sWidth.toFixed(2)}, sH=${sHeight.toFixed(2)}, sx=${sx.toFixed(2)}, sy=${sy.toFixed(2)}`);

      // --- Clipping and Boundary Adjustments ---
      // Adjust source rectangle if it goes outside the original image dimensions

      // 1. Check Left/Top boundaries (sx, sy < 0)
      if (sx < 0) {
          // We need to sample from sx=0, but the destination needs to be shifted right
          // The amount of shift needed on the canvas is sx * scale (in negative)
          // dx_adjusted = dx + Math.abs(sx * scale); <-- Incorrect, drawImage handles this via dWidth reduction?
          // Instead, reduce the source width and keep sx = 0
          sWidth += sx; // sx is negative, so this reduces sWidth
          sx = 0;
      }
      if (sy < 0) {
          sHeight += sy; // sy is negative, reduces sHeight
          sy = 0;
      }

      // 2. Check Right/Bottom boundaries (sx + sWidth > img.width, sy + sHeight > img.height)
      if (sx + sWidth > img.width) {
          sWidth = img.width - sx; // Reduce source width to fit
      }
      if (sy + sHeight > img.height) {
          sHeight = img.height - sy; // Reduce source height to fit
      }

      // 3. Ensure non-negative dimensions (can happen with extreme pans/zooms)
      sWidth = Math.max(0, sWidth);
      sHeight = Math.max(0, sHeight);

      // Calculate the *actual* destination width/height based on the clipped source
      const finalDWidth = sWidth * scale;
      const finalDHeight = sHeight * scale;

      // Calculate the *actual* destination x/y.
      // If sx was clamped to 0 (was negative), the drawing needs to start further right on the canvas.
      // If sy was clamped to 0 (was negative), the drawing needs to start further down on the canvas.
      const finalDx = dx + (sx === 0 && panOffset.x < 0 ? Math.abs(panOffset.x) : 0);
      const finalDy = dy + (sy === 0 && panOffset.y < 0 ? Math.abs(panOffset.y) : 0);


       console.log(`[${section}] Final Draw Params: sx=${sx.toFixed(2)}, sy=${sy.toFixed(2)}, sW=${sWidth.toFixed(2)}, sH=${sHeight.toFixed(2)} -> dx=${finalDx.toFixed(2)}, dy=${finalDy.toFixed(2)}, dW=${finalDWidth.toFixed(2)}, dH=${finalDHeight.toFixed(2)}`);


      // Only draw if source dimensions are valid
      if (sWidth > 0 && sHeight > 0 && finalDWidth > 0 && finalDHeight > 0) {
        ctx.drawImage(
          img,
          sx, sy, sWidth, sHeight,    // Source rect in original image
          finalDx, finalDy, finalDWidth, finalDHeight // Destination rect on canvas
        );
      } else {
         console.warn(`[${section}] Skipping draw due to invalid dimensions.`);
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

        // Use the provided logoZoom (pixel width) directly for the final canvas
        const targetLogoWidth = logoZoom;
        // Calculate proportional height based on logo's aspect ratio
        const targetLogoHeight = (logoImg.height / logoImg.width) * targetLogoWidth;

        console.log(`Target Logo Dimensions: ${targetLogoWidth.toFixed(2)}x${targetLogoHeight.toFixed(2)}`);

        // Calculate position based on percentage of final canvas dimensions
        // logoPosition refers to the center of the logo
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

      } catch (logoError: any) {
        console.error("Error loading or drawing logo:", logoError.message || logoError);
      }
    }

    console.log("\n--- Image Processing Complete ---");
    return canvas.toBuffer('image/png');

  } catch (error: any) {
      console.error("--- Error in processCompositeImage ---");
      console.error("Error Message:", error.message || error);
      console.error("Error Stack:", error.stack);
       console.error("Processing Params:", JSON.stringify(params, null, 2)); // Log params again on error
      // Re-throw or return an error state if needed by the API route
      throw new Error(`Image processing failed: ${error.message}`);
  }
}