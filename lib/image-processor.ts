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
    const leftTargetHeight = (finalWidth / 2) * (leftImg.height / leftImg.width);
    const rightTargetHeight = (finalWidth / 2) * (rightImg.height / rightImg.width);
    const finalHeight = Math.ceil(Math.max(leftTargetHeight, rightTargetHeight));
    console.log(`Final Canvas Dimensions: ${finalWidth}x${finalHeight}`);

    const canvas = createCanvas(finalWidth, finalHeight);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff'; // White background
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // --- REVISED Drawing Function with Robust Clipping ---
    const drawFinalImageSection = (
      img: Image,
      section: 'left' | 'right',
      zoomPercent: number,
      panOffset: { x: number; y: number }
    ) => {
      const scale = zoomPercent / 100;

      const dWidth = finalWidth / 2;
      const dHeight = finalHeight;
      const dx = section === 'left' ? 0 : dWidth;
      const dy = 0;

      // FIX: Use const as these initial values are not reassigned
      const sWidth = dWidth / scale;
      const sHeight = dHeight / scale;
      const sx = -panOffset.x / scale;
      const sy = -panOffset.y / scale;

      console.log(`[${section}] Initial Calc: scale=${scale.toFixed(2)}, sW=${sWidth.toFixed(2)}, sH=${sHeight.toFixed(2)}, sx=${sx.toFixed(2)}, sy=${sy.toFixed(2)}`);
      console.log(`[${section}] Pan Offset: x=${panOffset.x}, y=${panOffset.y}`);

      // --- Robust Clipping ---
      const clipSx = Math.max(0, sx);
      const clipSy = Math.max(0, sy);
      const clipEx = Math.min(img.width, sx + sWidth);
      const clipEy = Math.min(img.height, sy + sHeight);
      const clipSWidth = Math.max(0, clipEx - clipSx);
      const clipSHeight = Math.max(0, clipEy - clipSy);

      const clipDWidth = clipSWidth * scale;
      const clipDHeight = clipSHeight * scale;
      const clipDx = dx + (clipSx - sx) * scale;
      const clipDy = dy + (clipSy - sy) * scale;

      console.log(`[${section}] Clipped Source: sx=${clipSx.toFixed(2)}, sy=${clipSy.toFixed(2)}, sW=${clipSWidth.toFixed(2)}, sH=${clipSHeight.toFixed(2)}`);
      console.log(`[${section}] Clipped Dest: dx=${clipDx.toFixed(2)}, dy=${clipDy.toFixed(2)}, dW=${clipDWidth.toFixed(2)}, dH=${clipDHeight.toFixed(2)}`);

      if (clipSWidth > 0 && clipSHeight > 0 && clipDWidth > 0 && clipDHeight > 0) {
        ctx.drawImage(
          img,
          clipSx, clipSy, clipSWidth, clipSHeight,
          clipDx, clipDy, clipDWidth, clipDHeight
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

        const targetLogoWidth = (finalWidth * logoZoom) / 100;
        const logoAspectRatio = logoImg.height / logoImg.width;
        const targetLogoHeight = targetLogoWidth * (isNaN(logoAspectRatio) ? 1 : logoAspectRatio);

        console.log(`Target Logo Size (%=${logoZoom}): ${targetLogoWidth.toFixed(2)}x${targetLogoHeight.toFixed(2)}`);

        const logoCenterX = (finalWidth * logoPosition.x) / 100;
        const logoCenterY = (finalHeight * logoPosition.y) / 100;

        let logoDrawX = logoCenterX - targetLogoWidth / 2;
        let logoDrawY = logoCenterY - targetLogoHeight / 2;

        logoDrawX = clamp(logoDrawX, 0, finalWidth - targetLogoWidth);
        logoDrawY = clamp(logoDrawY, 0, finalHeight - targetLogoHeight);

        console.log(`Final Logo Draw Position (Top-Left): x=${logoDrawX.toFixed(2)}, y=${logoDrawY.toFixed(2)}`);

        ctx.drawImage(logoImg, logoDrawX, logoDrawY, targetLogoWidth, targetLogoHeight);
        console.log("Logo Drawn Successfully.");

      } catch (logoError) {
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