package net.streamflow.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.opengl.GLES20;
import android.opengl.GLUtils;
import android.opengl.Matrix;
import android.util.Base64;

import com.pedro.encoder.input.gl.render.filters.BaseFilterRender;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.Locale;

/**
 * Real-time chroma key compositor for RootEncoder 2.8.1.
 *
 * Pipeline:
 *   camera texture -> chroma replacement -> ticker -> logo -> encoder/preview
 *
 * Supported key colors:
 *   green, blue, magenta, custom HEX
 *
 * Supported backgrounds:
 *   nature  = Sunset Peaks style
 *   matrix  = Matrix Rain style
 *   neon    = Retro Grid style
 *   city    = Laser Waves / cyber style
 *   cozy    = Radial Spotlight style
 *   solid   = selected solid color
 *   custom  = uploaded image data URL
 *
 * All parameters can be changed while the stream is live.
 */
public class ChromaKeyFilterRender extends BaseFilterRender {

    private final Object lock = new Object();

    private boolean enabled = true;
    private String colorType = "green";
    private String customColor = "#00ff00";
    private float tolerance = 50f;
    private float smoothing = 20f;
    private float spillReduction = 30f;
    private String bgType = "neon";
    private String bgSolidColor = "#10051e";
    private String bgImageUrl = "";

    private Bitmap customBackgroundBitmap;
    private String customBackgroundSignature = "";
    private boolean customTextureAllocated = false;

    private final int[] customTexture = new int[]{0};

    private FloatBuffer squareVertex;

    private int program = -1;

    private int aPositionHandle = -1;
    private int aTextureHandle = -1;

    private int uMVPMatrixHandle = -1;
    private int uSTMatrixHandle = -1;
    private int uCameraSamplerHandle = -1;
    private int uBackgroundSamplerHandle = -1;

    private int uKeyColorHandle = -1;
    private int uToleranceHandle = -1;
    private int uSmoothingHandle = -1;
    private int uSpillHandle = -1;
    private int uEnabledHandle = -1;
    private int uBackgroundTypeHandle = -1;
    private int uSolidColorHandle = -1;
    private int uHasCustomBackgroundHandle = -1;
    private int uTimeHandle = -1;

    private long startTime = System.nanoTime();

    private static final float[] VERTEX_DATA = {
            -1f, -1f, 0f, 0f, 0f,
             1f, -1f, 0f, 1f, 0f,
            -1f,  1f, 0f, 0f, 1f,
             1f,  1f, 0f, 1f, 1f
    };

    public ChromaKeyFilterRender() {
        super();

        squareVertex = ByteBuffer
                .allocateDirect(VERTEX_DATA.length * 4)
                .order(ByteOrder.nativeOrder())
                .asFloatBuffer();

        squareVertex.put(VERTEX_DATA).position(0);

        Matrix.setIdentityM(MVPMatrix, 0);
        Matrix.setIdentityM(STMatrix, 0);
    }

    public void setChroma(
            boolean newEnabled,
            String newColorType,
            String newCustomColor,
            float newTolerance,
            float newSmoothing,
            float newSpillReduction,
            String newBgType,
            String newBgSolidColor,
            String newBgImageUrl
    ) {
        synchronized (lock) {
            enabled = newEnabled;

            colorType = normalizeColorType(newColorType);
            customColor = isValidHex(newCustomColor) ? newCustomColor : "#00ff00";

            tolerance = clamp(newTolerance, 0f, 180f);
            smoothing = clamp(newSmoothing, 0f, 80f);
            spillReduction = clamp(newSpillReduction, 0f, 100f);

            bgType = normalizeBackgroundType(newBgType);
            bgSolidColor = isValidHex(newBgSolidColor)
                    ? newBgSolidColor
                    : "#10051e";

            String incomingImage = newBgImageUrl == null ? "" : newBgImageUrl;

            if (!incomingImage.equals(customBackgroundSignature)) {
                customBackgroundSignature = incomingImage;
                bgImageUrl = incomingImage;
                decodeCustomBackgroundLocked(incomingImage);
            }
        }
    }

    private String normalizeColorType(String value) {
        if (value == null) return "green";

        String v = value.trim().toLowerCase(Locale.US);

        switch (v) {
            case "green":
            case "blue":
            case "magenta":
            case "custom":
                return v;
            default:
                return "green";
        }
    }

    private String normalizeBackgroundType(String value) {
        if (value == null) return "neon";

        String v = value.trim().toLowerCase(Locale.US);

        switch (v) {
            case "nature":
            case "matrix":
            case "neon":
            case "city":
            case "cozy":
            case "solid":
            case "custom":
                return v;
            default:
                return "neon";
        }
    }

    private boolean isValidHex(String value) {
        if (value == null) return false;
        return value.trim().matches("^#[0-9a-fA-F]{6}$");
    }

    private float clamp(float value, float min, float max) {
        return Math.max(min, Math.min(max, value));
    }

    private void decodeCustomBackgroundLocked(String dataUrl) {
        if (customBackgroundBitmap != null && !customBackgroundBitmap.isRecycled()) {
            customBackgroundBitmap.recycle();
            customBackgroundBitmap = null;
        }

        if (dataUrl == null || dataUrl.trim().isEmpty()) {
            return;
        }

        try {
            String encoded = dataUrl;

            int comma = encoded.indexOf(',');
            if (comma >= 0) {
                encoded = encoded.substring(comma + 1);
            }

            byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
            customBackgroundBitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);

            if (customBackgroundBitmap == null) {
                customBackgroundSignature = "";
            }
        } catch (Exception e) {
            customBackgroundBitmap = null;
            customBackgroundSignature = "";
        }
    }

    private int parseHexColor(String hex) {
        try {
            return Color.parseColor(hex);
        } catch (Exception e) {
            return Color.rgb(16, 5, 30);
        }
    }

    private float[] colorToRgb(String hex) {
        int color = parseHexColor(hex);

        return new float[]{
                Color.red(color) / 255f,
                Color.green(color) / 255f,
                Color.blue(color) / 255f
        };
    }

    private float[] getKeyColor() {
        synchronized (lock) {
            switch (colorType) {
                case "blue":
                    return new float[]{0f, 0f, 1f};

                case "magenta":
                    return new float[]{1f, 0f, 1f};

                case "custom":
                    return colorToRgb(customColor);

                case "green":
                default:
                    return new float[]{0f, 1f, 0f};
            }
        }
    }

    private int getBackgroundTypeId() {
        synchronized (lock) {
            switch (bgType) {
                case "nature":
                    return 1;
                case "matrix":
                    return 2;
                case "neon":
                    return 3;
                case "city":
                    return 4;
                case "cozy":
                    return 5;
                case "solid":
                    return 6;
                case "custom":
                    return 7;
                default:
                    return 3;
            }
        }
    }

    private boolean isCustomBackground() {
        synchronized (lock) {
            return "custom".equals(bgType)
                    && customBackgroundBitmap != null
                    && !customBackgroundBitmap.isRecycled();
        }
    }

    @Override
    protected void initGlFilter(Context context) {
        String vertexShader =
                "attribute vec4 aPosition;" +
                "attribute vec2 aTextureCoord;" +
                "varying vec2 vTextureCoord;" +
                "uniform mat4 uMVPMatrix;" +
                "uniform mat4 uSTMatrix;" +
                "void main(){" +
                "gl_Position=uMVPMatrix*aPosition;" +
                "vTextureCoord=(uSTMatrix*vec4(aTextureCoord,0.0,1.0)).xy;" +
                "}";

        String fragmentShader =
                "precision mediump float;" +
                "varying vec2 vTextureCoord;" +
                "uniform sampler2D uCameraSampler;" +
                "uniform sampler2D uBackgroundSampler;" +
                "uniform vec3 uKeyColor;" +
                "uniform float uTolerance;" +
                "uniform float uSmoothing;" +
                "uniform float uSpill;" +
                "uniform float uEnabled;" +
                "uniform int uBackgroundType;" +
                "uniform vec3 uSolidColor;" +
                "uniform float uHasCustomBackground;" +
                "uniform float uTime;" +

                "vec3 rgb2hsv(vec3 c){" +
                    "vec4 K=vec4(0.0,-0.3333333333,0.6666666667,-1.0);" +
                    "vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));" +
                    "vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));" +
                    "float d=q.x-min(q.w,q.y);" +
                    "float e=0.000001;" +
                    "return vec3(abs(q.z+(q.w-q.y)/(6.0*d+e)),d/(q.x+e),q.x);" +
                "}" +

                "vec3 proceduralBackground(vec2 uv){" +

                    "vec3 c;" +

                    // Sunset Peaks
                    "if(uBackgroundType==1){" +
                        "vec3 top=vec3(0.10,0.05,0.25);" +
                        "vec3 bottom=vec3(0.95,0.35,0.10);" +
                        "c=mix(bottom,top,uv.y);" +
                        "float sun=1.0-smoothstep(0.0,0.16,distance(uv,vec2(0.76,0.72)));" +
                        "c+=vec3(1.0,0.45,0.12)*sun;" +
                        "float mountain=step(0.56+0.10*sin(uv.x*7.0),uv.y);" +
                        "c=mix(c,vec3(0.07,0.025,0.08),mountain*0.85);" +
                    "}" +

                    // Matrix Rain
                    "else if(uBackgroundType==2){" +
                        "c=vec3(0.005,0.02,0.01);" +
                        "float col=step(0.88,fract(uv.x*38.0));" +
                        "float drops=step(0.93,fract(uv.y*17.0+uTime*(1.0+fract(uv.x*11.0))));" +
                        "c+=vec3(0.0,0.55,0.18)*col*drops;" +
                        "c+=vec3(0.0,0.12,0.04)*step(0.965,fract(uv.x*75.0+uv.y*19.0));" +
                    "}" +

                    // Retro Grid
                    "else if(uBackgroundType==3){" +
                        "c=mix(vec3(0.025,0.005,0.09),vec3(0.20,0.015,0.32),uv.y);" +
                        "float gx=1.0-smoothstep(0.0,0.035,abs(fract(uv.x*14.0)-0.5));" +
                        "float gy=1.0-smoothstep(0.0,0.035,abs(fract(uv.y*10.0+uTime*0.15)-0.5));" +
                        "c+=vec3(0.55,0.02,0.75)*(gx*0.32+gy*0.20);" +
                    "}" +

                    // Laser Waves / cyber city
                    "else if(uBackgroundType==4){" +
                        "c=mix(vec3(0.01,0.03,0.13),vec3(0.02,0.40,0.55),uv.y);" +
                        "float wave=0.5+0.5*sin(uv.x*18.0+uTime*2.0+sin(uv.y*8.0));" +
                        "c+=vec3(0.0,0.65,1.0)*smoothstep(0.72,1.0,wave)*(1.0-uv.y);" +
                        "float buildings=step(0.60+0.16*sin(uv.x*17.0),uv.y);" +
                        "c=mix(c,vec3(0.005,0.008,0.02),buildings*0.75);" +
                    "}" +

                    // Cozy Spotlight
                    "else if(uBackgroundType==5){" +
                        "c=mix(vec3(0.04,0.015,0.025),vec3(0.32,0.12,0.05),uv.y);" +
                        "float d=distance(uv,vec2(0.5,0.48));" +
                        "c+=vec3(1.0,0.58,0.25)*(1.0-smoothstep(0.0,0.58,d))*0.48;" +
                    "}" +

                    // Solid
                    "else if(uBackgroundType==6){" +
                        "c=uSolidColor;" +
                    "}" +

                    // Custom bitmap fallback
                    "else{" +
                        "c=uSolidColor;" +
                    "}" +

                    "return c;" +
                "}" +

                "void main(){" +
                    "vec4 src=texture2D(uCameraSampler,vTextureCoord);" +

                    "if(uEnabled<0.5){" +
                        "gl_FragColor=src;" +
                        "return;" +
                    "}" +

                    // Use HSV hue + saturation instead of only RGB distance.
                    // This keeps skin, hair and dark clothing much more reliably
                    // while removing unevenly lit green/blue/magenta screens.
                    "vec3 keyHsv=rgb2hsv(uKeyColor);" +
                    "vec3 srcHsv=rgb2hsv(src.rgb);" +
                    "float hueDistance=abs(srcHsv.x-keyHsv.x);" +
                    "hueDistance=min(hueDistance,1.0-hueDistance);" +

                    // UI tolerance 0..180 becomes approximately 4..36 degrees.
                    "float hueTolerance=mix(0.018,0.100,clamp(uTolerance/180.0,0.0,1.0));" +
                    "float hueFeather=mix(0.006,0.050,clamp(uSmoothing/80.0,0.0,1.0));" +
                    "float hueKey=1.0-smoothstep(hueTolerance,hueTolerance+hueFeather,hueDistance);" +
                    "float saturationGate=smoothstep(0.12,0.42,srcHsv.y);" +
                    "float valueGate=smoothstep(0.04,0.18,srcHsv.z);" +

                    // RGB distance remains as a secondary test for unusual colors.
                    "float rgbDistance=distance(src.rgb,uKeyColor);" +
                    "float rgbTolerance=mix(0.035,0.30,clamp(uTolerance/180.0,0.0,1.0));" +
                    "float rgbFeather=mix(0.01,0.10,clamp(uSmoothing/80.0,0.0,1.0));" +
                    "float rgbKey=1.0-smoothstep(rgbTolerance,rgbTolerance+rgbFeather,rgbDistance);" +

                    // Hue is dominant, RGB distance helps with custom colors.
                    "float keyMask=mix(hueKey,rgbKey,0.25)*saturationGate*valueGate;" +
                    "float alpha=1.0-clamp(keyMask,0.0,1.0);" +

                    "vec3 foreground=src.rgb;" +

                    // Spill suppression around the edge.
                    "float edge=1.0-alpha;" +
                    "if(uSpill>0.0 && edge>0.0){" +
                        "float keyStrength=uSpill*edge;" +
                        "if(uKeyColor.g>0.7 && uKeyColor.r<0.5 && uKeyColor.b<0.5){" +
                            "foreground.g=mix(foreground.g,max(foreground.r,foreground.b),keyStrength);" +
                        "}else if(uKeyColor.b>0.7 && uKeyColor.r<0.5 && uKeyColor.g<0.5){" +
                            "foreground.b=mix(foreground.b,max(foreground.r,foreground.g),keyStrength);" +
                        "}else if(uKeyColor.r>0.7 && uKeyColor.b>0.7 && uKeyColor.g<0.5){" +
                            "foreground.r=mix(foreground.r,foreground.g,keyStrength);" +
                            "foreground.b=mix(foreground.b,foreground.g,keyStrength);" +
                        "}" +
                    "}" +

                    "vec3 background;" +

                    "if(uBackgroundType==7 && uHasCustomBackground>0.5){" +
                        "background=texture2D(uBackgroundSampler,vec2(vTextureCoord.x,1.0-vTextureCoord.y)).rgb;" +
                    "}else{" +
                        "background=proceduralBackground(vec2(vTextureCoord.x,1.0-vTextureCoord.y));" +
                    "}" +

                    "gl_FragColor=vec4(mix(background,foreground,alpha),1.0);" +
                "}";

        program = createProgram(vertexShader, fragmentShader);

        aPositionHandle = GLES20.glGetAttribLocation(program, "aPosition");
        aTextureHandle = GLES20.glGetAttribLocation(program, "aTextureCoord");

        uMVPMatrixHandle = GLES20.glGetUniformLocation(program, "uMVPMatrix");
        uSTMatrixHandle = GLES20.glGetUniformLocation(program, "uSTMatrix");

        uCameraSamplerHandle = GLES20.glGetUniformLocation(program, "uCameraSampler");
        uBackgroundSamplerHandle = GLES20.glGetUniformLocation(program, "uBackgroundSampler");

        uKeyColorHandle = GLES20.glGetUniformLocation(program, "uKeyColor");
        uToleranceHandle = GLES20.glGetUniformLocation(program, "uTolerance");
        uSmoothingHandle = GLES20.glGetUniformLocation(program, "uSmoothing");
        uSpillHandle = GLES20.glGetUniformLocation(program, "uSpill");
        uEnabledHandle = GLES20.glGetUniformLocation(program, "uEnabled");
        uBackgroundTypeHandle = GLES20.glGetUniformLocation(program, "uBackgroundType");
        uSolidColorHandle = GLES20.glGetUniformLocation(program, "uSolidColor");
        uHasCustomBackgroundHandle = GLES20.glGetUniformLocation(program, "uHasCustomBackground");
        uTimeHandle = GLES20.glGetUniformLocation(program, "uTime");

        startTime = System.nanoTime();
    }

    private int createProgram(String vertexSource, String fragmentSource) {
        int vertexShader = loadShader(GLES20.GL_VERTEX_SHADER, vertexSource);
        int fragmentShader = loadShader(GLES20.GL_FRAGMENT_SHADER, fragmentSource);

        int createdProgram = GLES20.glCreateProgram();

        GLES20.glAttachShader(createdProgram, vertexShader);
        GLES20.glAttachShader(createdProgram, fragmentShader);
        GLES20.glLinkProgram(createdProgram);

        int[] linkStatus = new int[1];
        GLES20.glGetProgramiv(
                createdProgram,
                GLES20.GL_LINK_STATUS,
                linkStatus,
                0
        );

        if (linkStatus[0] == 0) {
            String error = GLES20.glGetProgramInfoLog(createdProgram);

            GLES20.glDeleteShader(vertexShader);
            GLES20.glDeleteShader(fragmentShader);
            GLES20.glDeleteProgram(createdProgram);

            throw new RuntimeException(
                    "ChromaKey shader link failed: " + error
            );
        }

        GLES20.glDeleteShader(vertexShader);
        GLES20.glDeleteShader(fragmentShader);

        return createdProgram;
    }

    private int loadShader(int type, String source) {
        int shader = GLES20.glCreateShader(type);

        GLES20.glShaderSource(shader, source);
        GLES20.glCompileShader(shader);

        int[] compileStatus = new int[1];

        GLES20.glGetShaderiv(
                shader,
                GLES20.GL_COMPILE_STATUS,
                compileStatus,
                0
        );

        if (compileStatus[0] == 0) {
            String error = GLES20.glGetShaderInfoLog(shader);

            GLES20.glDeleteShader(shader);

            throw new RuntimeException(
                    "ChromaKey shader compile failed: " + error
            );
        }

        return shader;
    }

    private void uploadCustomBackgroundIfNeeded() {
        Bitmap bitmap;

        synchronized (lock) {
            bitmap = customBackgroundBitmap;
        }

        if (bitmap == null || bitmap.isRecycled()) {
            return;
        }

        if (customTexture[0] == 0) {
            GLES20.glGenTextures(1, customTexture, 0);
        }

        if (customTexture[0] == 0) {
            return;
        }

        GLES20.glBindTexture(
                GLES20.GL_TEXTURE_2D,
                customTexture[0]
        );

        GLES20.glTexParameteri(
                GLES20.GL_TEXTURE_2D,
                GLES20.GL_TEXTURE_MIN_FILTER,
                GLES20.GL_LINEAR
        );

        GLES20.glTexParameteri(
                GLES20.GL_TEXTURE_2D,
                GLES20.GL_TEXTURE_MAG_FILTER,
                GLES20.GL_LINEAR
        );

        GLES20.glTexParameteri(
                GLES20.GL_TEXTURE_2D,
                GLES20.GL_TEXTURE_WRAP_S,
                GLES20.GL_CLAMP_TO_EDGE
        );

        GLES20.glTexParameteri(
                GLES20.GL_TEXTURE_2D,
                GLES20.GL_TEXTURE_WRAP_T,
                GLES20.GL_CLAMP_TO_EDGE
        );

        if (!customTextureAllocated) {
            GLUtils.texImage2D(
                    GLES20.GL_TEXTURE_2D,
                    0,
                    bitmap,
                    0
            );

            customTextureAllocated = true;
        } else {
            GLUtils.texSubImage2D(
                    GLES20.GL_TEXTURE_2D,
                    0,
                    0,
                    0,
                    bitmap
            );
        }

        GLES20.glBindTexture(
                GLES20.GL_TEXTURE_2D,
                0
        );
    }

    @Override
    protected void drawFilter() {
        if (program <= 0 || previousTexId == 0) {
            return;
        }

        float[] keyColor = getKeyColor();
        int backgroundType = getBackgroundTypeId();
        boolean hasCustomBackground = isCustomBackground();

        float localTolerance;
        float localSmoothing;
        float localSpill;
        boolean localEnabled;
        float[] solidColor;

        synchronized (lock) {
            localTolerance = tolerance;
            localSmoothing = smoothing;
            localSpill = spillReduction / 100f;
            localEnabled = enabled;
            solidColor = colorToRgb(bgSolidColor);
        }

        if (hasCustomBackground) {
            uploadCustomBackgroundIfNeeded();
        }

        float elapsedSeconds =
                (System.nanoTime() - startTime) / 1_000_000_000f;

        GLES20.glUseProgram(program);

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

        GLES20.glUniformMatrix4fv(
                uSTMatrixHandle,
                1,
                false,
                STMatrix,
                0
        );

        GLES20.glUniform3f(
                uKeyColorHandle,
                keyColor[0],
                keyColor[1],
                keyColor[2]
        );

        GLES20.glUniform1f(
                uToleranceHandle,
                localTolerance
        );

        GLES20.glUniform1f(
                uSmoothingHandle,
                localSmoothing
        );

        GLES20.glUniform1f(
                uSpillHandle,
                localSpill
        );

        GLES20.glUniform1f(
                uEnabledHandle,
                localEnabled ? 1f : 0f
        );

        GLES20.glUniform1i(
                uBackgroundTypeHandle,
                backgroundType
        );

        GLES20.glUniform3f(
                uSolidColorHandle,
                solidColor[0],
                solidColor[1],
                solidColor[2]
        );

        GLES20.glUniform1f(
                uHasCustomBackgroundHandle,
                hasCustomBackground ? 1f : 0f
        );

        GLES20.glUniform1f(
                uTimeHandle,
                elapsedSeconds
        );

        // Camera/input texture.
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0);
        GLES20.glBindTexture(
                GLES20.GL_TEXTURE_2D,
                previousTexId
        );

        GLES20.glUniform1i(
                uCameraSamplerHandle,
                0
        );

        // Uploaded custom background.
        if (hasCustomBackground && customTexture[0] != 0) {
            GLES20.glActiveTexture(GLES20.GL_TEXTURE1);

            GLES20.glBindTexture(
                    GLES20.GL_TEXTURE_2D,
                    customTexture[0]
            );

            GLES20.glUniform1i(
                    uBackgroundSamplerHandle,
                    1
            );
        }

        GLES20.glDrawArrays(
                GLES20.GL_TRIANGLE_STRIP,
                0,
                4
        );

        GLES20.glDisableVertexAttribArray(
                aPositionHandle
        );

        GLES20.glDisableVertexAttribArray(
                aTextureHandle
        );

        GLES20.glActiveTexture(GLES20.GL_TEXTURE1);
        GLES20.glBindTexture(
                GLES20.GL_TEXTURE_2D,
                0
        );

        GLES20.glActiveTexture(GLES20.GL_TEXTURE0);
        GLES20.glBindTexture(
                GLES20.GL_TEXTURE_2D,
                0
        );
    }

    @Override
    protected void disableResources() {
        if (aPositionHandle >= 0) {
            GLES20.glDisableVertexAttribArray(
                    aPositionHandle
            );
        }

        if (aTextureHandle >= 0) {
            GLES20.glDisableVertexAttribArray(
                    aTextureHandle
            );
        }
    }

    @Override
    public void release() {
        if (customTexture[0] != 0) {
            GLES20.glDeleteTextures(
                    1,
                    customTexture,
                    0
            );

            customTexture[0] = 0;
        }

        customTextureAllocated = false;

        if (program > 0) {
            GLES20.glDeleteProgram(program);
            program = -1;
        }

        synchronized (lock) {
            if (customBackgroundBitmap != null
                    && !customBackgroundBitmap.isRecycled()) {
                customBackgroundBitmap.recycle();
            }

            customBackgroundBitmap = null;
            customBackgroundSignature = "";
            bgImageUrl = "";
        }

        squareVertex = null;
    }
}
