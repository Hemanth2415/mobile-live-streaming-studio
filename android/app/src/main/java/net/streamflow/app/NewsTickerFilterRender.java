package net.streamflow.app;



import android.content.Context;

import android.graphics.Bitmap;

import android.graphics.Canvas;

import android.graphics.Color;

import android.graphics.Paint;

import android.graphics.PorterDuff;

import android.graphics.Typeface;

import android.opengl.GLES20;

import android.opengl.GLUtils;

import android.opengl.Matrix;



import com.pedro.encoder.input.gl.render.filters.BaseFilterRender;



import java.nio.ByteBuffer;

import java.nio.ByteOrder;

import java.nio.FloatBuffer;



/**

 * RootEncoder 2.8.1 camera + scrolling ticker compositor.

 *

 * IMPORTANT:

 * BaseFilterRender.draw() calls disableResources() after EVERY FRAME.

 * Therefore disableResources() must only disable GL attributes; it must NOT

 * delete the shader program or overlay texture. Permanent resources are

 * deleted in release().

 */

public class NewsTickerFilterRender extends BaseFilterRender {



    private static final int WIDTH = 1280;

    private static final int HEIGHT = 720;

    private static final float TICKER_HEIGHT = 105f;
    private static final float MIN_HEADER_WIDTH = 220f;
    private static final float MAX_HEADER_WIDTH = 440f;
    private static final float HEADER_HORIZONTAL_PADDING = 28f;



    private final Object lock = new Object();



    private String tickerHeader = "TICKER";
    private String tickerText = "BREAKING NEWS • LIVE FROM STREAMFLOW";
    private int headerBackgroundColor = Color.rgb(31, 41, 55);
    private int headerTextColor = Color.WHITE;

    private int backgroundColor = Color.RED;

    private int textColor = Color.WHITE;

    private float textSize = 42f;

    private float scrollSpeed = 3f;

    private float scrollX = 0f;

    private boolean enabled = true;



    private Bitmap tickerBitmap;

    private final int[] tickerTexture = new int[]{0};

    private boolean tickerTextureAllocated = false;



    private FloatBuffer squareVertex;

    private FloatBuffer overlayVertex;



    private int cameraProgram = -1;

    private int overlayProgram = -1;



    private int cameraPositionHandle = -1;

    private int cameraTextureHandle = -1;

    private int cameraMvpHandle = -1;

    private int cameraStHandle = -1;

    private int cameraSamplerHandle = -1;



    private int overlayPositionHandle = -1;

    private int overlayTextureHandle = -1;

    private int overlayMvpHandle = -1;

    private int overlaySamplerHandle = -1;



    private static final float[] VERTICES = {

            -1f, -1f, 0f, 0f, 0f,

             1f, -1f, 0f, 1f, 0f,

            -1f,  1f, 0f, 0f, 1f,

             1f,  1f, 0f, 1f, 1f

    };



    // Overlay quad occupies only the bottom ticker band.

    // Clip-space Y: -1 is bottom, +1 is top.

    private static final float[] OVERLAY_VERTICES = {

            -1f, -1f, 0f, 0f, 0f,

             1f, -1f, 0f, 1f, 0f,

            -1f, -1f + (2f * TICKER_HEIGHT / HEIGHT), 0f, 0f, 1f,

             1f, -1f + (2f * TICKER_HEIGHT / HEIGHT), 0f, 1f, 1f

    };



    public NewsTickerFilterRender() {

        super();



        squareVertex = ByteBuffer

                .allocateDirect(VERTICES.length * 4)

                .order(ByteOrder.nativeOrder())

                .asFloatBuffer();

        squareVertex.put(VERTICES).position(0);



        overlayVertex = ByteBuffer

                .allocateDirect(OVERLAY_VERTICES.length * 4)

                .order(ByteOrder.nativeOrder())

                .asFloatBuffer();

        overlayVertex.put(OVERLAY_VERTICES).position(0);



        Matrix.setIdentityM(MVPMatrix, 0);

        Matrix.setIdentityM(STMatrix, 0);

    }



    /**
     * Configure the fixed ticker header and scrolling news text.
     * Both are rendered into the same bitmap and therefore become part of
     * the Android preview and the encoded RTMP/RTMPS stream.
     */
    public void setTicker(

            String header,
            String text,
            String speed,
            int bgColor,
            int txtColor,
            float fontSize,
            boolean isEnabled
    ) {
        synchronized (lock) {
            tickerHeader = (header == null || header.trim().isEmpty())
                    ? "TICKER"
                    : header.trim();
            tickerText = (text == null || text.trim().isEmpty())
                    ? "BREAKING NEWS • LIVE FROM STREAMFLOW"
                    : text;
            backgroundColor = bgColor;
            textColor = txtColor;
            textSize = fontSize <= 0 ? 42f : Math.max(24f, fontSize * 3f);
            scrollSpeed = getSpeed(speed);
            enabled = isEnabled;
        }
    }

    /** Backward-compatible overload for older callers. */
    public void setTicker(
            String text,
            String speed,
            int bgColor,
            int txtColor,
            float fontSize,
            boolean isEnabled
    ) {
        setTicker(
                "TICKER", text, speed, bgColor, txtColor, fontSize, isEnabled
        );
    }



    public void setEnabled(boolean value) {

        synchronized (lock) { enabled = value; }

    }



    public void setText(String text) {

        synchronized (lock) {

            if (text != null && !text.trim().isEmpty()) tickerText = text;

        }

    }



    public void setSpeed(String speed) {

        synchronized (lock) { scrollSpeed = getSpeed(speed); }

    }



    private float getSpeed(String speed) {

        if (speed == null) return 3f;

        switch (speed.toLowerCase()) {

            case "slow": return 1.5f;

            case "fast": return 5f;

            default: return 3f;

        }

    }



    @Override

    protected void initGlFilter(Context context) {

        // Camera pass: intentionally follows RootEncoder's normal filter path.

        String cameraVertex =

                "attribute vec4 aPosition;" +

                "attribute vec2 aTextureCoord;" +

                "varying vec2 vTextureCoord;" +

                "uniform mat4 uMVPMatrix;" +

                "uniform mat4 uSTMatrix;" +

                "void main(){" +

                "gl_Position=uMVPMatrix*aPosition;" +

                "vTextureCoord=(uSTMatrix*vec4(aTextureCoord,0.0,1.0)).xy;" +

                "}";



        String cameraFragment =

                "precision mediump float;" +

                "varying vec2 vTextureCoord;" +

                "uniform sampler2D uSampler;" +

                "void main(){gl_FragColor=texture2D(uSampler,vTextureCoord);}";



        cameraProgram = createProgram(cameraVertex, cameraFragment);

        cameraPositionHandle = GLES20.glGetAttribLocation(cameraProgram, "aPosition");

        cameraTextureHandle = GLES20.glGetAttribLocation(cameraProgram, "aTextureCoord");

        cameraMvpHandle = GLES20.glGetUniformLocation(cameraProgram, "uMVPMatrix");

        cameraStHandle = GLES20.glGetUniformLocation(cameraProgram, "uSTMatrix");

        cameraSamplerHandle = GLES20.glGetUniformLocation(cameraProgram, "uSampler");



        // Overlay pass: transparent ticker bitmap over the already-rendered camera.

        String overlayVertex =

                "attribute vec4 aPosition;" +

                "attribute vec2 aTextureCoord;" +

                "varying vec2 vTextureCoord;" +

                "uniform mat4 uMVPMatrix;" +

                "void main(){" +

                "gl_Position=uMVPMatrix*aPosition;" +

                "vTextureCoord=vec2(aTextureCoord.x, 1.0-aTextureCoord.y);" +

                "}";



        String overlayFragment =

                "precision mediump float;" +

                "varying vec2 vTextureCoord;" +

                "uniform sampler2D uOverlayTexture;" +

                "void main(){gl_FragColor=texture2D(uOverlayTexture,vTextureCoord);} ";



        overlayProgram = createProgram(overlayVertex, overlayFragment);

        overlayPositionHandle = GLES20.glGetAttribLocation(overlayProgram, "aPosition");

        overlayTextureHandle = GLES20.glGetAttribLocation(overlayProgram, "aTextureCoord");

        overlayMvpHandle = GLES20.glGetUniformLocation(overlayProgram, "uMVPMatrix");

        overlaySamplerHandle = GLES20.glGetUniformLocation(overlayProgram, "uOverlayTexture");



        tickerBitmap = Bitmap.createBitmap(WIDTH, (int) TICKER_HEIGHT, Bitmap.Config.ARGB_8888);

        loadTickerTexture(true);

    }



    private int createProgram(String vertexSource, String fragmentSource) {

        int vs = loadShader(GLES20.GL_VERTEX_SHADER, vertexSource);

        int fs = loadShader(GLES20.GL_FRAGMENT_SHADER, fragmentSource);

        int program = GLES20.glCreateProgram();

        GLES20.glAttachShader(program, vs);

        GLES20.glAttachShader(program, fs);

        GLES20.glLinkProgram(program);



        int[] status = new int[1];

        GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, status, 0);

        if (status[0] == 0) {

            String error = GLES20.glGetProgramInfoLog(program);

            GLES20.glDeleteShader(vs);

            GLES20.glDeleteShader(fs);

            GLES20.glDeleteProgram(program);

            throw new RuntimeException("NewsTicker shader link failed: " + error);

        }



        GLES20.glDeleteShader(vs);

        GLES20.glDeleteShader(fs);

        return program;

    }



    private int loadShader(int type, String source) {

        int shader = GLES20.glCreateShader(type);

        GLES20.glShaderSource(shader, source);

        GLES20.glCompileShader(shader);

        int[] status = new int[1];

        GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, status, 0);

        if (status[0] == 0) {

            String error = GLES20.glGetShaderInfoLog(shader);

            GLES20.glDeleteShader(shader);

            throw new RuntimeException("NewsTicker shader compile failed: " + error);

        }

        return shader;

    }



    private void drawTickerBitmap() {

        if (tickerBitmap == null || tickerBitmap.isRecycled()) return;



        boolean localEnabled;

        String localText;

        int localBg;

        int localTextColor;

        float localTextSize;

        float localSpeed;



        synchronized (lock) {

            localEnabled = enabled;

            localText = tickerText;

            localBg = backgroundColor;

            localTextColor = textColor;

            localTextSize = textSize;

            localSpeed = scrollSpeed;

        }



        Canvas canvas = new Canvas(tickerBitmap);
        canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR);

        if (!localEnabled) return;

        String localHeader;
        synchronized (lock) {
            localHeader = tickerHeader;
        }
        localHeader = localHeader == null ? "TICKER" : localHeader.trim();
        if (localHeader.isEmpty()) localHeader = "TICKER";
        localHeader = localHeader.toUpperCase();

        // Size the fixed header from the actual text so longer headers such as
        // "BREAKING NEWS" are not clipped. Keep reasonable limits so the
        // scrolling ticker always has usable space.
        Paint headerText = new Paint(Paint.ANTI_ALIAS_FLAG);
        headerText.setColor(headerTextColor);
        headerText.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        headerText.setSubpixelText(true);
        headerText.setTextAlign(Paint.Align.CENTER);

        float headerTextSize = Math.max(30f, localTextSize * 0.78f);
        headerText.setTextSize(headerTextSize);

        float measuredHeaderWidth = headerText.measureText(localHeader) + HEADER_HORIZONTAL_PADDING * 2f;
        float headerWidth = Math.max(MIN_HEADER_WIDTH, Math.min(MAX_HEADER_WIDTH, measuredHeaderWidth));

        // If the header is extremely long, reduce its font size until it fits
        // inside the maximum header width instead of cutting the text off.
        if (measuredHeaderWidth > MAX_HEADER_WIDTH) {
            float availableTextWidth = MAX_HEADER_WIDTH - HEADER_HORIZONTAL_PADDING * 2f;
            float measuredText = Math.max(1f, headerText.measureText(localHeader));
            headerTextSize *= availableTextWidth / measuredText;
            headerTextSize = Math.max(22f, headerTextSize);
            headerText.setTextSize(headerTextSize);
            headerWidth = Math.max(
                    MIN_HEADER_WIDTH,
                    Math.min(MAX_HEADER_WIDTH, headerText.measureText(localHeader) + HEADER_HORIZONTAL_PADDING * 2f)
            );
        }

        // Fixed header block.
        Paint headerBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        headerBg.setColor(headerBackgroundColor);
        canvas.drawRect(0, 0, headerWidth, TICKER_HEIGHT, headerBg);

        Paint.FontMetrics headerFm = headerText.getFontMetrics();
        float headerBaseline =
                TICKER_HEIGHT / 2f -
                (headerFm.ascent + headerFm.descent) / 2f;

        canvas.drawText(
                localHeader,
                headerWidth / 2f,
                headerBaseline,
                headerText
        );

        // Keep the scrolling ticker background fully enabled and configurable.
        Paint tickerBg = new Paint(Paint.ANTI_ALIAS_FLAG);
        tickerBg.setColor(localBg);
        canvas.drawRect(headerWidth, 0, WIDTH, TICKER_HEIGHT, tickerBg);

        // Divider between the fixed header and scrolling text.
        Paint separator = new Paint(Paint.ANTI_ALIAS_FLAG);
        separator.setColor(Color.argb(180, 255, 255, 255));
        canvas.drawRect(
                headerWidth - 2f,
                0,
                headerWidth,
                TICKER_HEIGHT,
                separator
        );

        // Scroll only in the area to the right of the header.
        canvas.save();
        canvas.clipRect(headerWidth, 0, WIDTH, TICKER_HEIGHT);

        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setColor(localTextColor);
        text.setTextSize(localTextSize);
        text.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        text.setSubpixelText(true);

        String display =
                "     " + localText +
                "          •          " + localText + "     ";

        float textWidth = text.measureText(display);
        if (textWidth <= 1f) {
            canvas.restore();
            return;
        }

        scrollX -= localSpeed;
        if (scrollX <= -textWidth) scrollX = 0f;

        Paint.FontMetrics fm = text.getFontMetrics();
        float baseline =
                TICKER_HEIGHT / 2f -
                (fm.ascent + fm.descent) / 2f;

        for (
                float x = headerWidth + scrollX - textWidth;
                x < WIDTH;
                x += textWidth
        ) {
            canvas.drawText(display, x, baseline, text);
        }

        canvas.restore();
    }



    private void loadTickerTexture(boolean first) {

        if (tickerBitmap == null || tickerBitmap.isRecycled()) return;



        if (tickerTexture[0] == 0) {

            GLES20.glGenTextures(1, tickerTexture, 0);

        }

        if (tickerTexture[0] == 0) return;



        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, tickerTexture[0]);

        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);

        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);

        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);

        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);



        if (first || !tickerTextureAllocated) {

            GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, tickerBitmap, 0);

            tickerTextureAllocated = true;

        } else {

            GLUtils.texSubImage2D(GLES20.GL_TEXTURE_2D, 0, 0, 0, tickerBitmap);

        }



        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0);

    }



    @Override

    protected void drawFilter() {

        if (cameraProgram <= 0 || overlayProgram <= 0 || previousTexId == 0) return;



        // -------- PASS 1: CAMERA --------

        GLES20.glUseProgram(cameraProgram);



        squareVertex.position(0);

        GLES20.glVertexAttribPointer(cameraPositionHandle, 3, GLES20.GL_FLOAT, false, 5 * 4, squareVertex);

        GLES20.glEnableVertexAttribArray(cameraPositionHandle);



        squareVertex.position(3);

        GLES20.glVertexAttribPointer(cameraTextureHandle, 2, GLES20.GL_FLOAT, false, 5 * 4, squareVertex);

        GLES20.glEnableVertexAttribArray(cameraTextureHandle);



        GLES20.glUniformMatrix4fv(cameraMvpHandle, 1, false, MVPMatrix, 0);

        GLES20.glUniformMatrix4fv(cameraStHandle, 1, false, STMatrix, 0);

        GLES20.glUniform1i(cameraSamplerHandle, 0);



        GLES20.glActiveTexture(GLES20.GL_TEXTURE0);

        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, previousTexId);



        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);



        GLES20.glDisableVertexAttribArray(cameraPositionHandle);

        GLES20.glDisableVertexAttribArray(cameraTextureHandle);



        // Update ticker bitmap after camera is drawn, then upload it.

        drawTickerBitmap();

        loadTickerTexture(false);



        // -------- PASS 2: TICKER OVER CAMERA --------

        if (enabled && tickerTexture[0] != 0) {

            GLES20.glUseProgram(overlayProgram);



            overlayVertex.position(0);

            GLES20.glVertexAttribPointer(overlayPositionHandle, 3, GLES20.GL_FLOAT, false, 5 * 4, overlayVertex);

            GLES20.glEnableVertexAttribArray(overlayPositionHandle);



            overlayVertex.position(3);

            GLES20.glVertexAttribPointer(overlayTextureHandle, 2, GLES20.GL_FLOAT, false, 5 * 4, overlayVertex);

            GLES20.glEnableVertexAttribArray(overlayTextureHandle);



            GLES20.glUniformMatrix4fv(overlayMvpHandle, 1, false, MVPMatrix, 0);

            GLES20.glUniform1i(overlaySamplerHandle, 1);



            GLES20.glActiveTexture(GLES20.GL_TEXTURE1);

            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, tickerTexture[0]);



            GLES20.glEnable(GLES20.GL_BLEND);

            GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA);

            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);

            GLES20.glDisable(GLES20.GL_BLEND);



            GLES20.glDisableVertexAttribArray(overlayPositionHandle);

            GLES20.glDisableVertexAttribArray(overlayTextureHandle);

        }



        GLES20.glActiveTexture(GLES20.GL_TEXTURE1);

        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0);

        GLES20.glActiveTexture(GLES20.GL_TEXTURE0);

        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, 0);

    }



    /**

     * BaseFilterRender.draw() calls this after each frame.

     * DO NOT delete programs/textures here.

     */

    @Override

    protected void disableResources() {

        if (cameraPositionHandle >= 0) GLES20.glDisableVertexAttribArray(cameraPositionHandle);

        if (cameraTextureHandle >= 0) GLES20.glDisableVertexAttribArray(cameraTextureHandle);

        if (overlayPositionHandle >= 0) GLES20.glDisableVertexAttribArray(overlayPositionHandle);

        if (overlayTextureHandle >= 0) GLES20.glDisableVertexAttribArray(overlayTextureHandle);

    }



    @Override

    public void release() {

        if (tickerTexture[0] != 0) {

            GLES20.glDeleteTextures(1, tickerTexture, 0);

            tickerTexture[0] = 0;

        }

        tickerTextureAllocated = false;



        if (cameraProgram > 0) {

            GLES20.glDeleteProgram(cameraProgram);

            cameraProgram = -1;

        }

        if (overlayProgram > 0) {

            GLES20.glDeleteProgram(overlayProgram);

            overlayProgram = -1;

        }



        if (tickerBitmap != null && !tickerBitmap.isRecycled()) {

            tickerBitmap.recycle();

            tickerBitmap = null;

        }

        squareVertex = null;

        overlayVertex = null;

    }

}
