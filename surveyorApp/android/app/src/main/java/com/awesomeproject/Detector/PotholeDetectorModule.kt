package com.awesomeproject.Detector

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.facebook.react.bridge.*
import java.io.File
import kotlin.math.max

class PotholeDetectorModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "PotholeDetector"
    }

    @ReactMethod
    fun detectFrame(imagePath: String, promise: Promise) {
        try {
            val cleanPath = imagePath.replace("file://", "")
            val file = File(cleanPath)

            if (!file.exists()) {
                val map = Arguments.createMap()
                map.putBoolean("detected", false)
                map.putDouble("confidence", 0.0)
                promise.resolve(map)
                return
            }

            // Downsample image for fast near-instant analysis (640px width target)
            val boundsOptions = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            BitmapFactory.decodeFile(file.absolutePath, boundsOptions)

            var sampleSize = 1
            val targetWidth = 640
            if (boundsOptions.outWidth > targetWidth) {
                sampleSize = max(1, boundsOptions.outWidth / targetWidth)
            }

            val decodeOptions = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
                inPreferredConfig = Bitmap.Config.RGB_565
            }

            val bitmap = BitmapFactory.decodeFile(file.absolutePath, decodeOptions)
            if (bitmap == null) {
                val map = Arguments.createMap()
                map.putBoolean("detected", false)
                map.putDouble("confidence", 0.0)
                promise.resolve(map)
                return
            }

            // Perform fast on-device analysis on downsampled bitmap pixels
            val result = analyzeBitmapForPotholes(bitmap)
            bitmap.recycle()
            promise.resolve(result)

        } catch (e: Exception) {
            promise.reject("DETECTION_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getBase64(imagePath: String, promise: Promise) {
        try {
            val cleanPath = imagePath.replace("file://", "")
            val file = File(cleanPath)
            if (!file.exists()) {
                promise.resolve("")
                return
            }
            val bytes = file.readBytes()
            val base64 = android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
            promise.resolve("data:image/jpeg;base64,$base64")
        } catch (e: Exception) {
            promise.resolve("")
        }
    }

    private fun analyzeBitmapForPotholes(bitmap: Bitmap): WritableMap {
        val response = Arguments.createMap()
        val width = bitmap.width
        val height = bitmap.height

        // Sample pixels from lower half of image (road surface region)
        val startY = (height * 0.4).toInt()
        val sampleHeight = height - startY
        
        var darkPixelCount = 0
        var totalSampled = 0
        var maxDarkClusterX = 0
        var maxDarkClusterY = 0

        val step = max(1, (width / 60))

        for (y in startY until height step step) {
            for (x in 0 until width step step) {
                val pixel = bitmap.getPixel(x, y)
                val r = (pixel shr 16) and 0xff
                val g = (pixel shr 8) and 0xff
                val b = pixel and 0xff
                val brightness = (r + g + b) / 3

                totalSampled++
                // Potholes manifest as dark contrast depressions against road pavement
                if (brightness < 75) {
                    darkPixelCount++
                    maxDarkClusterX += x
                    maxDarkClusterY += y
                }
            }
        }

        val darkRatio = if (totalSampled > 0) darkPixelCount.toDouble() / totalSampled else 0.0

        // Pothole detection trigger threshold
        if (darkRatio > 0.08) {
            val conf = minOf(0.96, 0.55 + (darkRatio * 2.2))
            val avgX = if (darkPixelCount > 0) (maxDarkClusterX / darkPixelCount) else (width / 2)
            val avgY = if (darkPixelCount > 0) (maxDarkClusterY / darkPixelCount) else (height / 2)

            response.putBoolean("detected", true)
            response.putDouble("confidence", conf)

            val bbox = Arguments.createArray()
            val boxW = (width * 0.4).toInt()
            val boxH = (height * 0.25).toInt()
            val x1 = max(0, avgX - boxW / 2)
            val y1 = max(0, avgY - boxH / 2)

            bbox.pushInt(x1)
            bbox.pushInt(y1)
            bbox.pushInt(boxW)
            bbox.pushInt(boxH)

            response.putArray("bbox", bbox)
        } else {
            response.putBoolean("detected", false)
            response.putDouble("confidence", 0.0)
        }

        return response
    }
}
