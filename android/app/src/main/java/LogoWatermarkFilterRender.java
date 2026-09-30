package net.streamflow.app;



import android.content.Context;

import android.graphics.Bitmap;

import android.graphics.BitmapFactory;

import android.graphics.Canvas;

import android.graphics.Color;

import android.graphics.Movie;

import android.graphics.Paint;

import android.graphics.PorterDuff;

import android.graphics.RectF;

import android.opengl.GLES20;

import android.opengl.GLUtils;

import android.opengl.Matrix;

import android.util.Base64;



import java.nio.ByteBuffer;

import java.nio.ByteOrder;

import java.nio.FloatBuffer;



import com.pedro.encoder.input.gl.render.filters.BaseFilterRender;





/**

 * Native branded logo/watermark overlay for RootEncoder.

 *

 * This filter is intentionally an overlay-only filter:

 * - the camera frame remains underneath

 * - the logo is rendered with alpha blending

 * - changes can be applied while the stream is live

 * - the same GL chain is used by the Android preview and RTMP/RTMPS output

 *

 * Supported presets:

 *   news    -> Globe News

 *   gaming  -> Esports Pro

 *   sports  -> Gold Champion

 *   tech    -> Digital Tech

 *   custom  -> PNG/GIF supplied by the React UI

 *

 * For custom GIFs, Movie is used so animated GIFs continue animating.

 */

public class LogoWatermarkFilterRender extends BaseFilterRender {



    private static final int CANVAS_WIDTH = 1280;

    private static final int CANVAS_HEIGHT = 720;



    private final Object lock = new Object();



    private String preset = "news";

    private String customDataUrl = "";

    private String customSignature = "";



    private String position = "top-right";

    // Logo position controlled by the X/Y sliders.
    // X: 0 = left, 50 = center, 100 = right.
    // Y: 0 = top, 50 = center, 100 = bottom.
    private float logoX = 100f;
    private float logoY = 0f;

    private float sizePercent = 16f;

    private float opacity = 0.9f;

    private int padding = 12;

    private boolean enabled = true;



    private Bitmap customBitmap;

    private Movie customMovie;

    private long gifStartTime = -1L;



    private Bitmap bitmap;



    private final int[] textures = new int[]{0};



    private int program;



    // Use the exact same X/Y/Z/U/V geometry as the working NewsTickerFilterRender.

    private FloatBuffer squareVertex;



    /*

     * X, Y, Z, U, V

     *

     * This orientation is important. The logo filter receives the already

     * composited camera/ticker frame through previousTexId, so it must use

     * the same texture-coordinate convention as the ticker filter.

     */

    private static final float[] VERTEX_DATA = {

            -1f, -1f, 0f, 0f, 0f,

             1f, -1f, 0f, 1f, 0f,

            -1f,  1f, 0f, 0f, 1f,

             1f,  1f, 0f, 1f, 1f

    };



    // Attribute handles for the standard X/Y/Z/U/V square geometry.

    // These must be declared locally because BaseFilterRender does not expose

    // them as fields in the RootEncoder version used by this project.

    private int aPositionHandle = -1;

    private int aTextureHandle = -1;



    // Shader uniform handles for the camera + logo compositing pass.

    private int uMVPMatrixHandle = -1;

    private int uSTMatrixHandle = -1;

    private int uCameraSamplerHandle = -1;

    private int uOverlaySamplerHandle = -1;



    /*

     * IMPORTANT:

     * Do not create a second/custom vertex buffer here.

     *

     * RootEncoder BaseFilterRender already provides squareVertex,

     * aPositionHandle and aTextureHandle using the same orientation

     * convention as the working NewsTickerFilterRender.

     *

     * Using that shared geometry keeps the incoming camera/ticker frame

     * in the exact same orientation.

     */



    public LogoWatermarkFilterRender() {

        super();



        squareVertex = ByteBuffer

                .allocateDirect(VERTEX_DATA.length * 4)

                .order(ByteOrder.nativeOrder())

                .asFloatBuffer();



        squareVertex

                .put(VERTEX_DATA)

                .position(0);



        Matrix.setIdentityM(MVPMatrix, 0);

        Matrix.setIdentityM(STMatrix, 0);

    }



    /**

     * Update all logo settings. This can be called from Capacitor while live.

     */

    public void setLogo(

            String newPreset,

            String newCustomDataUrl,

            String newPosition,

            float newSizePercent,

            float newOpacity,

            int newPadding,

            boolean newEnabled

    ) {

        synchronized (lock) {

            preset = normalizePreset(newPreset);

            position = normalizePosition(newPosition);

            sizePercent = clamp(newSizePercent, 1f, 60f);

            opacity = clamp(newOpacity, 0f, 1f);

            padding = Math.max(0, Math.min(newPadding, 200));

            enabled = newEnabled;



            String incoming = newCustomDataUrl == null ? "" : newCustomDataUrl;



            if (!incoming.equals(customSignature)) {

                customSignature = incoming;

                customDataUrl = incoming;

                decodeCustomLogoLocked(incoming);

            }

        }

    }



    /**
     * Update only the free X/Y logo position. Safe to call while streaming.
     */
    public void setLogoPosition(float newX, float newY) {
        synchronized (lock) {
            logoX = clamp(newX, 0f, 100f);
            logoY = clamp(newY, 0f, 100f);
        }
    }

    private String normalizePreset(String value) {

        if (value == null) return "news";

        String v = value.trim().toLowerCase();



        switch (v) {

            case "news":

            case "gaming":

            case "sports":

            case "tech":

            case "custom":

                return v;

            default:

                return "news";

        }

    }



    private String normalizePosition(String value) {

        if (value == null) return "top-right";

        String v = value.trim().toLowerCase();



        switch (v) {

            case "top-left":

            case "top-right":

            case "bottom-left":

            case "bottom-right":

                return v;

            default:

                return "top-right";

        }

    }



    private float clamp(float value, float min, float max) {

        return Math.max(min, Math.min(max, value));

    }



    /**

     * Decode a data:image/... URL supplied by the WebView.

     *

     * PNG/JPEG become Bitmap.

     * GIF becomes Movie so animated GIFs can be rendered frame-by-frame.

     */

    private void decodeCustomLogoLocked(String dataUrl) {

        releaseCustomLogoLocked();



        if (dataUrl == null || dataUrl.trim().isEmpty()) {

            return;

        }



        try {

            int comma = dataUrl.indexOf(',');

            if (comma < 0 || comma >= dataUrl.length() - 1) {

                LogHelper.log("Invalid custom logo data URL");

                return;

            }



            String header = dataUrl.substring(0, comma).toLowerCase();

            String payload = dataUrl.substring(comma + 1);



            byte[] bytes;



            if (header.contains(";base64")) {

                bytes = Base64.decode(payload, Base64.DEFAULT);

            } else {

                // The React FileReader normally provides base64 data URLs.

                // Keep a safe fallback for unexpected URL-encoded payloads.

                bytes = Base64.decode(payload, Base64.DEFAULT);

            }



            if (header.contains("image/gif")) {

                customMovie = Movie.decodeByteArray(bytes, 0, bytes.length);

                if (customMovie != null) {

                    gifStartTime = -1L;

                    return;

                }

            }



            customBitmap = BitmapFactory.decodeByteArray(

                    bytes,

                    0,

                    bytes.length

            );



        } catch (Exception e) {

            LogHelper.log("Could not decode custom logo: " + e.getMessage());

            releaseCustomLogoLocked();

        }

    }



    private void releaseCustomLogoLocked() {

        customMovie = null;

        gifStartTime = -1L;



        if (customBitmap != null && !customBitmap.isRecycled()) {

            customBitmap.recycle();

        }



        customBitmap = null;

    }



    @Override

    protected void initGlFilter(Context context) {



        // This filter is an OVERLAY filter. It must sample the texture produced

        // by the previous filter (camera or camera+ticker) and then composite

        // the logo over that texture. Never replace the previous texture with

        // the logo-only texture.

        String vertexShaderCode =

                "attribute vec4 aPosition;" +

                "attribute vec2 aTextureCoord;" +

                "varying vec2 vCameraTextureCoord;" +

                "varying vec2 vOverlayTextureCoord;" +

                "uniform mat4 uMVPMatrix;" +

                "uniform mat4 uSTMatrix;" +

                "void main() {" +

                "    gl_Position = uMVPMatrix * aPosition;" +

                "    vCameraTextureCoord = (uSTMatrix * vec4(aTextureCoord, 0.0, 1.0)).xy;" +

                "    vOverlayTextureCoord = vec2(aTextureCoord.x, 1.0 - aTextureCoord.y);" +

                "}";



        String fragmentShaderCode =

                "precision mediump float;" +

                "varying vec2 vCameraTextureCoord;" +

                "varying vec2 vOverlayTextureCoord;" +

                "uniform sampler2D uCameraTexture;" +

                "uniform sampler2D uOverlayTexture;" +

                "void main() {" +

                "    vec4 cameraColor = texture2D(uCameraTexture, vCameraTextureCoord);" +

                "    vec4 overlayColor = texture2D(uOverlayTexture, vOverlayTextureCoord);" +

                "    gl_FragColor = mix(cameraColor, overlayColor, overlayColor.a);" +

                "}";



        int vertexShader = loadShader(GLES20.GL_VERTEX_SHADER, vertexShaderCode);

        int fragmentShader = loadShader(GLES20.GL_FRAGMENT_SHADER, fragmentShaderCode);



        program = GLES20.glCreateProgram();

        GLES20.glAttachShader(program, vertexShader);

        GLES20.glAttachShader(program, fragmentShader);

        GLES20.glLinkProgram(program);



        int[] linkStatus = new int[1];

        GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, linkStatus, 0);

        if (linkStatus[0] == 0) {

            String error = GLES20.glGetProgramInfoLog(program);

            GLES20.glDeleteProgram(program);

            program = -1;

            throw new RuntimeException("LogoWatermarkFilterRender shader link failed: " + error);

        }



        GLES20.glDeleteShader(vertexShader);

        GLES20.glDeleteShader(fragmentShader);



        // Use the same shader attributes as NewsTickerFilterRender.

        aPositionHandle = GLES20.glGetAttribLocation(program, "aPosition");

        aTextureHandle = GLES20.glGetAttribLocation(program, "aTextureCoord");

        uMVPMatrixHandle = GLES20.glGetUniformLocation(program, "uMVPMatrix");

        uSTMatrixHandle = GLES20.glGetUniformLocation(program, "uSTMatrix");

        uCameraSamplerHandle = GLES20.glGetUniformLocation(program, "uCameraTexture");

        uOverlaySamplerHandle = GLES20.glGetUniformLocation(program, "uOverlayTexture");



        // The logo bitmap is rendered using the same square geometry as the

        // working ticker filter. This prevents the incoming camera/ticker

        // texture from being vertically flipped.

        bitmap = Bitmap.createBitmap(

                CANVAS_WIDTH,

                CANVAS_HEIGHT,

                Bitmap.Config.ARGB_8888

        );



        loadTexture();

    }



    /**

     * Rebuild the transparent overlay bitmap for the current frame.

     */

    private void drawLogoBitmap() {

        if (bitmap == null) {

            return;

        }



        Canvas canvas = new Canvas(bitmap);



        canvas.drawColor(

                Color.TRANSPARENT,

                PorterDuff.Mode.CLEAR

        );



        String localPreset;

        String localPosition;

        String localCustomDataUrl;

        float localSize;

        float localOpacity;

        int localPadding;

        boolean localEnabled;



        synchronized (lock) {

            localPreset = preset;

            localPosition = position;

            localCustomDataUrl = customDataUrl;

            localSize = sizePercent;

            localOpacity = opacity;

            localPadding = padding;

            localEnabled = enabled;

        }



        if (!localEnabled || localOpacity <= 0f) {

            return;

        }



        int alpha = Math.round(255f * localOpacity);



        Paint paint = new Paint(

                Paint.ANTI_ALIAS_FLAG |

                Paint.FILTER_BITMAP_FLAG |

                Paint.SUBPIXEL_TEXT_FLAG

        );

        paint.setAlpha(alpha);



        float targetWidth =

                CANVAS_WIDTH * (localSize / 100f);



        float pad =

                CANVAS_WIDTH * (localPadding / 1280f);



        if (localPreset.equals("custom") &&

                (!localCustomDataUrl.isEmpty()) &&

                (customBitmap != null || customMovie != null)) {



            drawCustomLogo(

                    canvas,

                    paint,

                    targetWidth,

                    pad

            );



        } else {

            drawPresetLogo(

                    canvas,

                    paint,

                    localPreset,

                    targetWidth,

                    pad

            );

        }

    }



    private void drawCustomLogo(

            Canvas canvas,

            Paint paint,

            float targetWidth,

            float pad

    ) {

        float sourceWidth;

        float sourceHeight;



        synchronized (lock) {

            if (customBitmap != null) {

                sourceWidth = customBitmap.getWidth();

                sourceHeight = customBitmap.getHeight();

            } else if (customMovie != null) {

                sourceWidth = customMovie.width();

                sourceHeight = customMovie.height();

            } else {

                return;

            }

        }



        if (sourceWidth <= 0 || sourceHeight <= 0) {

            return;

        }



        float targetHeight =

                targetWidth * (sourceHeight / sourceWidth);



        float[] xy = getPosition(

                targetWidth,

                targetHeight,

                pad

        );



        if (customMovie != null) {

            synchronized (lock) {

                if (gifStartTime < 0L) {

                    gifStartTime = android.os.SystemClock.uptimeMillis();

                }



                int duration = customMovie.duration();

                int movieTime = 0;



                if (duration > 0) {

                    long elapsed =

                            android.os.SystemClock.uptimeMillis() -

                            gifStartTime;



                    movieTime =

                            (int) (elapsed % duration);

                }



                customMovie.setTime(movieTime);



                canvas.save();

                canvas.translate(xy[0], xy[1]);

                canvas.scale(

                        targetWidth / sourceWidth,

                        targetHeight / sourceHeight

                );

                customMovie.draw(

                        canvas,

                        0,

                        0,

                        paint

                );

                canvas.restore();

            }



            return;

        }



        Bitmap localBitmap;



        synchronized (lock) {

            localBitmap = customBitmap;

        }



        if (localBitmap == null ||

                localBitmap.isRecycled()) {

            return;

        }



        RectF destination = new RectF(

                xy[0],

                xy[1],

                xy[0] + targetWidth,

                xy[1] + targetHeight

        );



        canvas.drawBitmap(

                localBitmap,

                null,

                destination,

                paint

        );

    }



    /**

     * Native preset artwork. These are vector/text based, so no extra Android

     * drawable files are required for the four preset buttons.

     */

    private void drawPresetLogo(

            Canvas canvas,

            Paint paint,

            String presetName,

            float targetWidth,

            float pad

    ) {

        float targetHeight = targetWidth * 0.34f;



        float[] xy = getPosition(

                targetWidth,

                targetHeight,

                pad

        );



        float left = xy[0];

        float top = xy[1];

        float right = left + targetWidth;

        float bottom = top + targetHeight;



        if (presetName.equals("news")) {

            drawNewsPreset(

                    canvas,

                    left,

                    top,

                    right,

                    bottom,

                    alphaFrom(paint)

            );

        } else if (presetName.equals("gaming")) {

            drawGamingPreset(

                    canvas,

                    left,

                    top,

                    right,

                    bottom,

                    alphaFrom(paint)

            );

        } else if (presetName.equals("sports")) {

            drawSportsPreset(

                    canvas,

                    left,

                    top,

                    right,

                    bottom,

                    alphaFrom(paint)

            );

        } else {

            drawTechPreset(

                    canvas,

                    left,

                    top,

                    right,

                    bottom,

                    alphaFrom(paint)

            );

        }

    }



    private int alphaFrom(Paint paint) {

        return paint.getAlpha();

    }



    private void drawNewsPreset(

            Canvas canvas,

            float left,

            float top,

            float right,

            float bottom,

            int alpha

    ) {

        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

        p.setAlpha(alpha);



        float w = right - left;

        float h = bottom - top;



        p.setColor(Color.rgb(8, 112, 180));

        canvas.drawRoundRect(

                new RectF(left, top, right, bottom),

                targetRadius(h),

                targetRadius(h),

                p

        );



        float globeR = h * 0.31f;

        float globeCx = left + w * 0.17f;

        float globeCy = (top + bottom) / 2f;



        p.setStyle(Paint.Style.STROKE);

        p.setStrokeWidth(Math.max(2f, h * 0.045f));

        p.setColor(Color.WHITE);

        canvas.drawCircle(globeCx, globeCy, globeR, p);

        canvas.drawOval(

                new RectF(

                        globeCx - globeR * 0.45f,

                        globeCy - globeR,

                        globeCx + globeR * 0.45f,

                        globeCy + globeR

                ),

                p

        );

        canvas.drawLine(

                globeCx - globeR,

                globeCy,

                globeCx + globeR,

                globeCy,

                p

        );



        p.setStyle(Paint.Style.FILL);

        p.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);

        p.setTextSize(Math.max(12f, w * 0.12f));

        p.setColor(Color.WHITE);

        canvas.drawText(

                "GLOBE NEWS",

                left + w * 0.32f,

                globeCy + h * 0.14f,

                p

        );

    }



    private void drawGamingPreset(

            Canvas canvas,

            float left,

            float top,

            float right,

            float bottom,

            int alpha

    ) {

        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

        p.setAlpha(alpha);



        float w = right - left;

        float h = bottom - top;



        p.setColor(Color.rgb(106, 38, 170));

        canvas.drawRoundRect(

                new RectF(left, top, right, bottom),

                targetRadius(h),

                targetRadius(h),

                p

        );



        float cx = left + w * 0.15f;

        float cy = (top + bottom) / 2f;



        p.setColor(Color.WHITE);

        canvas.drawCircle(cx, cy, h * 0.27f, p);



        p.setColor(Color.rgb(106, 38, 170));

        canvas.drawRect(

                cx - h * 0.17f,

                cy - h * 0.035f,

                cx + h * 0.17f,

                cy + h * 0.035f,

                p

        );

        canvas.drawRect(

                cx - h * 0.035f,

                cy - h * 0.17f,

                cx + h * 0.035f,

                cy + h * 0.17f,

                p

        );



        p.setColor(Color.WHITE);

        p.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);

        p.setTextSize(Math.max(12f, w * 0.12f));

        canvas.drawText(

                "ESPORTS PRO",

                left + w * 0.31f,

                cy + h * 0.14f,

                p

        );

    }



    private void drawSportsPreset(

            Canvas canvas,

            float left,

            float top,

            float right,

            float bottom,

            int alpha

    ) {

        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

        p.setAlpha(alpha);



        float w = right - left;

        float h = bottom - top;



        p.setColor(Color.rgb(194, 137, 24));

        canvas.drawRoundRect(

                new RectF(left, top, right, bottom),

                targetRadius(h),

                targetRadius(h),

                p

        );



        float cx = left + w * 0.15f;

        float cy = (top + bottom) / 2f;



        p.setColor(Color.WHITE);

        canvas.drawCircle(cx, cy, h * 0.27f, p);



        p.setColor(Color.rgb(194, 137, 24));

        PathHelper.drawStar(

                canvas,

                cx,

                cy,

                h * 0.22f,

                h * 0.10f,

                p

        );



        p.setColor(Color.WHITE);

        p.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);

        p.setTextSize(Math.max(11f, w * 0.105f));

        canvas.drawText(

                "GOLD CHAMPION",

                left + w * 0.31f,

                cy + h * 0.14f,

                p

        );

    }



    private void drawTechPreset(

            Canvas canvas,

            float left,

            float top,

            float right,

            float bottom,

            int alpha

    ) {

        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

        p.setAlpha(alpha);



        float w = right - left;

        float h = bottom - top;



        p.setColor(Color.rgb(16, 142, 156));

        canvas.drawRoundRect(

                new RectF(left, top, right, bottom),

                targetRadius(h),

                targetRadius(h),

                p

        );



        float cx = left + w * 0.15f;

        float cy = (top + bottom) / 2f;



        p.setColor(Color.WHITE);

        canvas.drawCircle(cx, cy, h * 0.25f, p);



        p.setColor(Color.rgb(16, 142, 156));

        canvas.drawCircle(cx, cy, h * 0.08f, p);



        p.setColor(Color.WHITE);

        p.setStrokeWidth(Math.max(2f, h * 0.045f));

        p.setStyle(Paint.Style.STROKE);



        canvas.drawLine(

                cx - h * 0.20f,

                cy,

                cx - h * 0.34f,

                cy,

                p

        );

        canvas.drawLine(

                cx + h * 0.20f,

                cy,

                cx + h * 0.34f,

                cy,

                p

        );

        canvas.drawLine(

                cx,

                cy - h * 0.20f,

                cx,

                cy - h * 0.34f,

                p

        );



        p.setStyle(Paint.Style.FILL);

        p.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);

        p.setTextSize(Math.max(11f, w * 0.11f));

        canvas.drawText(

                "DIGITAL TECH",

                left + w * 0.31f,

                cy + h * 0.14f,

                p

        );

    }



    private float targetRadius(float height) {

        return Math.max(4f, height * 0.18f);

    }



    /**

     * Returns x/y in the 1280x720 overlay bitmap.

     */

    private float[] getPosition(
            float width,
            float height,
            float pad
    ) {
        float xPercent;
        float yPercent;

        synchronized (lock) {
            xPercent = logoX;
            yPercent = logoY;
        }

        float availableWidth =
                CANVAS_WIDTH - width - (pad * 2f);

        float availableHeight =
                CANVAS_HEIGHT - height - (pad * 2f);

        availableWidth = Math.max(0f, availableWidth);
        availableHeight = Math.max(0f, availableHeight);

        float x =
                pad +
                (availableWidth * (xPercent / 100f));

        float y =
                pad +
                (availableHeight * (yPercent / 100f));

        x = Math.max(0f, Math.min(x, CANVAS_WIDTH - width));
        y = Math.max(0f, Math.min(y, CANVAS_HEIGHT - height));

        return new float[]{x, y};
    }

    private void loadTexture() {

        if (bitmap == null || bitmap.isRecycled()) {

            return;

        }



        if (textures[0] == 0) {

            GLES20.glGenTextures(1, textures, 0);

        }



        if (textures[0] == 0) {

            return;

        }



        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, textures[0]);

        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);

        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);

        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);

        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);



        GLUtils.texImage2D(

                GLES20.GL_TEXTURE_2D,

                0,

                bitmap,

                0

        );



        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0);

    }



    @Override

    protected void drawFilter() {



        /*

         * This is an overlay-only filter.

         *

         * previousTexId is the complete frame produced by the filters before

         * this one (camera + ticker). We sample that texture unchanged and

         * then mix the logo on top.

         *

         * IMPORTANT:

         * Use the same squareVertex orientation as the working

         * NewsTickerFilterRender. The old custom 2D vertex/UV buffers were

         * flipping the incoming camera/ticker texture vertically.

         */

        drawLogoBitmap();

        loadTexture();



        if (program <= 0 ||

                textures[0] == 0 ||

                previousTexId == 0 ||

                squareVertex == null) {

            return;

        }



        GLES20.glUseProgram(program);



        /*

         * RootEncoder squareVertex layout:

         *

         *   X Y Z | U V

         *

         * This is the same layout used by NewsTickerFilterRender.

         */

        squareVertex.position(0);



        GLES20.glVertexAttribPointer(

                aPositionHandle,

                3,

                GLES20.GL_FLOAT,

                false,

                5 * 4,

                squareVertex

        );



        GLES20.glEnableVertexAttribArray(aPositionHandle);



        squareVertex.position(3);



        GLES20.glVertexAttribPointer(

                aTextureHandle,

                2,

                GLES20.GL_FLOAT,

                false,

                5 * 4,

                squareVertex

        );



        GLES20.glEnableVertexAttribArray(aTextureHandle);



        GLES20.glUniformMatrix4fv(

                uMVPMatrixHandle,

                1,

                false,

                MVPMatrix,

                0

        );



        /*

         * STMatrix belongs to the incoming camera texture. Keep it exactly

         * as supplied by RootEncoder so orientation is preserved.

         */

        GLES20.glUniformMatrix4fv(

                uSTMatrixHandle,

                1,

                false,

                STMatrix,

                0

        );



        /*

         * Texture unit 0 = complete previous composition:

         * camera + ticker.

         */

        GLES20.glActiveTexture(GLES20.GL_TEXTURE0);

        GLES20.glBindTexture(

                GLES20.GL_TEXTURE_2D,

                previousTexId

        );

        GLES20.glUniform1i(uCameraSamplerHandle, 0);



        /*

         * Texture unit 1 = transparent logo bitmap.

         */

        GLES20.glActiveTexture(GLES20.GL_TEXTURE1);

        GLES20.glBindTexture(

                GLES20.GL_TEXTURE_2D,

                textures[0]

        );

        GLES20.glUniform1i(uOverlaySamplerHandle, 1);



        GLES20.glDrawArrays(

                GLES20.GL_TRIANGLE_STRIP,

                0,

                4

        );



        GLES20.glDisableVertexAttribArray(aPositionHandle);

        GLES20.glDisableVertexAttribArray(aTextureHandle);



        GLES20.glActiveTexture(GLES20.GL_TEXTURE1);

        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0);



        GLES20.glActiveTexture(GLES20.GL_TEXTURE0);

        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0);

    }



    private int loadShader(

            int type,

            String shaderCode

    ) {

        int shader =

                GLES20.glCreateShader(type);



        GLES20.glShaderSource(

                shader,

                shaderCode

        );



        GLES20.glCompileShader(shader);



        return shader;

    }



    /**

     * BaseFilterRender calls this after each GL frame.

     * Only disable temporary GL state here; do not delete textures/programs.

     */

    @Override

    protected void disableResources() {

        // BaseFilterRender may call this between draw passes.

        // Do NOT delete the program or texture here; they are needed for the

        // next frame. Resource deletion belongs in release().

        if (aPositionHandle >= 0) {

            GLES20.glDisableVertexAttribArray(aPositionHandle);

        }



        if (aTextureHandle >= 0) {

            GLES20.glDisableVertexAttribArray(aTextureHandle);

        }



        GLES20.glActiveTexture(GLES20.GL_TEXTURE1);

        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0);

        GLES20.glActiveTexture(GLES20.GL_TEXTURE0);

        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0);

    }



    @Override

    public void release() {



        // First release the per-frame GL state.

        disableResources();



        // Actual GL resource deletion happens only when the filter is released.

        if (textures[0] != 0) {

            GLES20.glDeleteTextures(1, textures, 0);

            textures[0] = 0;

        }



        if (program > 0) {

            GLES20.glDeleteProgram(program);

            program = -1;

        }



        if (bitmap != null &&

                !bitmap.isRecycled()) {

            bitmap.recycle();

            bitmap = null;

        }



        synchronized (lock) {

            releaseCustomLogoLocked();

        }



        squareVertex = null;

    }



    /**

     * Small local helpers keep the filter self-contained.

     */

    private static class LogHelper {

        static void log(String message) {

            android.util.Log.w(

                    "LogoWatermarkFilter",

                    message

            );

        }

    }



    private static class PathHelper {

        static void drawStar(

                Canvas canvas,

                float cx,

                float cy,

                float outer,

                float inner,

                Paint paint

        ) {

            android.graphics.Path path =

                    new android.graphics.Path();



            for (int i = 0; i < 10; i++) {

                double angle =

                        -Math.PI / 2.0 +

                        (i * Math.PI / 5.0);



                float radius =

                        (i % 2 == 0) ? outer : inner;



                float x =

                        cx +

                        (float) Math.cos(angle) * radius;



                float y =

                        cy +

                        (float) Math.sin(angle) * radius;



                if (i == 0) {

                    path.moveTo(x, y);

                } else {

                    path.lineTo(x, y);

                }

            }



            path.close();

            canvas.drawPath(path, paint);

        }

    }

}
