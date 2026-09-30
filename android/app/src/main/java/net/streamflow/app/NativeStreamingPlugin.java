package net.streamflow.app;



import android.Manifest;

import android.content.pm.ActivityInfo;

import android.graphics.Color;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.drawable.Drawable;

import android.os.Build;

import android.util.Log;

import android.view.Gravity;

import android.view.TextureView;

import android.view.Window;

import android.view.WindowInsets;

import android.view.WindowInsetsController;

import android.view.View;

import android.widget.FrameLayout;

import android.widget.Button;



import android.graphics.drawable.GradientDrawable;



import androidx.annotation.NonNull;



import com.getcapacitor.JSObject;

import com.getcapacitor.Plugin;

import com.getcapacitor.PluginCall;

import com.getcapacitor.annotation.CapacitorPlugin;

import com.getcapacitor.annotation.Permission;

import com.getcapacitor.annotation.PermissionCallback;

import com.getcapacitor.PermissionState;

import com.getcapacitor.PluginMethod;



import com.pedro.common.ConnectChecker;

import com.pedro.encoder.input.sources.video.Camera2Source;

import com.pedro.library.rtmp.RtmpStream;



@CapacitorPlugin(

        name = "NativeStreaming",

        permissions = {

                @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }),

                @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })

        }

)



public class NativeStreamingPlugin extends Plugin {



    private static final String TAG =

            "NativeStreamingPlugin";



    private RtmpStream stream;



    private Camera2Source cameraSource;



    private NewsTickerFilterRender tickerFilter;

    private LogoWatermarkFilterRender logoFilter;
    private ChromaKeyFilterRender chromaFilter;



    private boolean streaming = false;



    private TextureView previewView;

    private FrameLayout previewRoot;

    private Button fullscreenControlsButton;
    private Button cameraSwitchButton;
    private boolean nativeFrontCamera = false;

    private boolean previewStarted = false;



    private String currentProtocol = "";



    private String currentEndpoint = "";



    private String currentStreamKey = "";



    private ConnectChecker createConnectChecker() {

        return new ConnectChecker() {



                        @Override

                        public void onConnectionStarted(

                                @NonNull String rtmpUrl

                        ) {



                            Log.d(

                                    TAG,

                                    "Connection started: " +

                                            rtmpUrl

                            );



                            notifyConnection(

                                    "started",

                                    rtmpUrl

                            );

                        }



                        @Override

                        public void onConnectionSuccess() {



                            streaming = true;



                            Log.d(

                                    TAG,

                                    "RTMP connection successful"

                            );



                            notifyConnection(

                                    "connected",

                                    ""

                            );

                        }



                        @Override

                        public void onConnectionFailed(

                                @NonNull String reason

                        ) {



                            Log.e(

                                    TAG,

                                    "RTMP connection failed: " +

                                            reason

                            );



                            streaming = false;



                            notifyConnection(

                                    "failed",

                                    reason

                            );

                        }



                        @Override

                        public void onNewBitrate(

                                long bitrate

                        ) {



                            Log.d(

                                    TAG,

                                    "Bitrate: " +

                                            bitrate

                            );



                            JSObject data =

                                    new JSObject();



                            data.put(

                                    "bitrate",

                                    bitrate

                            );



                            notifyListeners(

                                    "streamBitrate",

                                    data

                            );

                        }



                        @Override

                        public void onDisconnect() {



                            Log.d(

                                    TAG,

                                    "RTMP disconnected"

                            );



                            streaming = false;



                            notifyConnection(

                                    "disconnected",

                                    ""

                            );

                        }



                        @Override

                        public void onAuthError() {



                            Log.e(

                                    TAG,

                                    "RTMP authentication error"

                            );

                            streaming = false;



                            notifyConnection(

                                    "authError",

                                    ""

                            );

                        }



                        @Override

                        public void onAuthSuccess() {



                            Log.d(

                                    TAG,

                                    "RTMP authentication successful"

                            );



                            notifyConnection(

                                    "authSuccess",

                                    ""

                            );

                        }

                    };

    }



    @PluginMethod

    public void startCamera(PluginCall call) {

        if (stream != null || cameraSource != null) {

            call.resolve();

            return;

        }



        PermissionState cameraPermission = getPermissionState("camera");

        PermissionState microphonePermission = getPermissionState("microphone");



        if (cameraPermission != PermissionState.GRANTED || microphonePermission != PermissionState.GRANTED) {

            requestPermissionForAliases(new String[] { "camera", "microphone" }, call, "cameraPermissionsCallback");

            return;

        }



        initializeCamera(call);

    }



    @PermissionCallback

    private void cameraPermissionsCallback(PluginCall call) {

        PermissionState cameraPermission = getPermissionState("camera");

        PermissionState microphonePermission = getPermissionState("microphone");



        if (cameraPermission != PermissionState.GRANTED || microphonePermission != PermissionState.GRANTED) {

            call.reject("Camera and microphone permissions are required to start the native camera.");

            return;

        }



        initializeCamera(call);

    }



    private void initializeCamera(PluginCall call) {

        // Keep the live camera/broadcast view in landscape.

        // The Controls & Analytics page temporarily switches the Android UI to portrait.

        getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);



        int width = call.getInt("width", 1280);

        int height = call.getInt("height", 720);

        int bitrateKbps = call.getInt("bitrateKbps", 2500);

        int fps = call.getInt("fps", 30);

        String facing = call.getString("facing", "environment");

        boolean audioEnabled = call.getBoolean("audioEnabled", true);

        boolean tickerEnabled = call.getBoolean("tickerEnabled", true);

        String tickerHeader = call.getString("tickerHeader", "TICKER");
        String tickerText = call.getString("tickerText", "BREAKING NEWS • LIVE FROM STREAMFLOW");

        String tickerSpeed = call.getString("tickerSpeed", "medium");

        String tickerBgColor = call.getString("tickerBgColor", "#dc2626");

        String tickerTextColor = call.getString("tickerTextColor", "#ffffff");

        int tickerFontSize = call.getInt("tickerFontSize", 14);



        boolean logoEnabled = call.getBoolean("logoEnabled", true);

        String logoPreset = call.getString("logoPreset", "news");

        String logoCustomUrl = call.getString("logoCustomUrl", "");

        String logoPosition = call.getString("logoPosition", "top-right");

        float logoSize = call.getDouble("logoSize", 16.0).floatValue();

        float logoOpacity = call.getDouble("logoOpacity", 0.9).floatValue();

        int logoPadding = call.getInt("logoPadding", 12);
        float logoX = call.getDouble("logoX", 100.0).floatValue();
        float logoY = call.getDouble("logoY", 0.0).floatValue();
        boolean chromaEnabled = call.getBoolean("chromaEnabled", true);
        String chromaColorType = call.getString("chromaColorType", "green");
        String chromaCustomColor = call.getString("chromaCustomColor", "#00ff00");
        float chromaTolerance = call.getDouble("chromaTolerance", 50.0).floatValue();
        float chromaSmoothing = call.getDouble("chromaSmoothing", 20.0).floatValue();
        float chromaSpillReduction = call.getDouble("chromaSpillReduction", 30.0).floatValue();
        String chromaBgType = call.getString("chromaBgType", "neon");
        String chromaBgSolidColor = call.getString("chromaBgSolidColor", "#10051e");
        String chromaBgImageUrl = call.getString("chromaBgImageUrl", "");




        try {

            ConnectChecker checker = createConnectChecker();

            stream = new RtmpStream(getContext(), checker);



            if (!(stream.getVideoSource() instanceof Camera2Source)) {

                stream = null;

                call.reject("RootEncoder is not using Camera2Source");

                return;

            }



            cameraSource = (Camera2Source) stream.getVideoSource();



            if ("user".equalsIgnoreCase(facing)) {

                try {

                    cameraSource.switchCamera();

                } catch (Exception e) {

                    Log.e(TAG, "Could not switch to front camera", e);

                }

            }



            int bitrateBps = bitrateKbps * 1000;

            if (!stream.prepareVideo(width, height, bitrateBps, fps, 2, 0)) {

                stopInternal();

                call.reject("Could not prepare video encoder");

                return;

            }



            // Let RootEncoder handle the camera/display orientation. Without this,

            // portrait Android previews can appear rotated or stretched.

            stream.getGlInterface().setAutoHandleOrientation(true);



            createPreviewView();



            boolean audioPrepared = stream.prepareAudio(44100, true, 128 * 1024, false, false);

            if (!audioPrepared && audioEnabled) {

                stopInternal();

                call.reject("Could not prepare audio encoder");

                return;

            }



            chromaFilter = new ChromaKeyFilterRender();
            chromaFilter.setChroma(
                    chromaEnabled,
                    chromaColorType,
                    chromaCustomColor,
                    chromaTolerance,
                    chromaSmoothing,
                    chromaSpillReduction,
                    chromaBgType,
                    chromaBgSolidColor,
                    chromaBgImageUrl
            );
            stream.getGlInterface().addFilter(chromaFilter);

            tickerFilter = new NewsTickerFilterRender();

            tickerFilter.setTicker(

                    tickerHeader, tickerText, tickerSpeed,

                    parseColor(tickerBgColor, Color.RED),

                    parseColor(tickerTextColor, Color.WHITE),

                    tickerFontSize, tickerEnabled

            );



            stream.getGlInterface().addFilter(tickerFilter);



            logoFilter = new LogoWatermarkFilterRender();

            logoFilter.setLogo(

                    logoPreset,

                    logoCustomUrl,

                    logoPosition,

                    logoSize,

                    logoOpacity,

                    logoPadding,

                    logoEnabled

            );
            logoFilter.setLogoPosition(logoX, logoY);

            stream.getGlInterface().addFilter(logoFilter);



            startPreviewIfReady();

            stream.getGlInterface().setForceRender(true, fps);



            call.resolve();

        } catch (Exception e) {

            Log.e(TAG, "startCamera error", e);

            stopInternal();

            call.reject("Unable to start native camera: " + e.getMessage());

        }

    }



    @PluginMethod

    public void startStream(

            PluginCall call

    ) {

        PermissionState cameraPermission = getPermissionState("camera");

        PermissionState microphonePermission = getPermissionState("microphone");



        if (cameraPermission != PermissionState.GRANTED || microphonePermission != PermissionState.GRANTED) {

            requestPermissionForAliases(

                    new String[] { "camera", "microphone" },

                    call,

                    "streamPermissionsCallback"

            );

            return;

        }



        initializeStream(call);

    }



    @PermissionCallback

    private void streamPermissionsCallback(PluginCall call) {

        PermissionState cameraPermission = getPermissionState("camera");

        PermissionState microphonePermission = getPermissionState("microphone");



        if (cameraPermission != PermissionState.GRANTED || microphonePermission != PermissionState.GRANTED) {

            call.reject("Camera and microphone permissions are required to start live streaming.");

            return;

        }



        initializeStream(call);

    }



    private void initializeStream(

            PluginCall call

    ) {



        // Lock the phone to landscape for the live broadcast.

        // This prevents Android sensor rotation from tilting the encoded video.

        getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);



        if (streaming) {



            call.reject(

                    "Stream is already running"

            );



            return;

        }



        String protocol =

                call.getString(

                        "protocol",

                        "RTMP"

                );



        String serverUrl =

                call.getString(

                        "serverUrl",

                        ""

                );



        String streamKey =

                call.getString(

                        "streamKey",

                        ""

                );



        int width =

                call.getInt(

                        "width",

                        1280

                );



        int height =

                call.getInt(

                        "height",

                        720

                );



        int bitrateKbps =

                call.getInt(

                        "bitrateKbps",

                        2500

                );



        int fps =

                call.getInt(

                        "fps",

                        30

                );



        String facing =

                call.getString(

                        "facing",

                        "environment"

                );



        boolean audioEnabled =

                call.getBoolean(

                        "audioEnabled",

                        true

                );



        /*

         * Ticker settings.

         */

        boolean tickerEnabled =

                call.getBoolean(

                        "tickerEnabled",

                        true

                );



        String tickerHeader =

                call.getString(

                        "tickerHeader",

                        "TICKER"

                );



        String tickerText =

                call.getString(

                        "tickerText",

                        "BREAKING NEWS • LIVE FROM STREAMFLOW"

                );



        String tickerSpeed =

                call.getString(

                        "tickerSpeed",

                        "medium"

                );



        String tickerBgColor =

                call.getString(

                        "tickerBgColor",

                        "#dc2626"

                );



        String tickerTextColor =

                call.getString(

                        "tickerTextColor",

                        "#ffffff"

                );



        int tickerFontSize =

                call.getInt(

                        "tickerFontSize",

                        14

                );



        boolean logoEnabled = call.getBoolean("logoEnabled", true);

        String logoPreset = call.getString("logoPreset", "news");

        String logoCustomUrl = call.getString("logoCustomUrl", "");

        String logoPosition = call.getString("logoPosition", "top-right");

        float logoSize = call.getDouble("logoSize", 16.0).floatValue();

        float logoOpacity = call.getDouble("logoOpacity", 0.9).floatValue();

        int logoPadding = call.getInt("logoPadding", 12);
        float logoX = call.getDouble("logoX", 100.0).floatValue();
        float logoY = call.getDouble("logoY", 0.0).floatValue();
        boolean chromaEnabled = call.getBoolean("chromaEnabled", true);
        String chromaColorType = call.getString("chromaColorType", "green");
        String chromaCustomColor = call.getString("chromaCustomColor", "#00ff00");
        float chromaTolerance = call.getDouble("chromaTolerance", 50.0).floatValue();
        float chromaSmoothing = call.getDouble("chromaSmoothing", 20.0).floatValue();
        float chromaSpillReduction = call.getDouble("chromaSpillReduction", 30.0).floatValue();
        String chromaBgType = call.getString("chromaBgType", "neon");
        String chromaBgSolidColor = call.getString("chromaBgSolidColor", "#10051e");
        String chromaBgImageUrl = call.getString("chromaBgImageUrl", "");




        /*

         * Currently this native implementation is for

         * RTMP/RTMPS.

         */

        if (!protocol.equalsIgnoreCase("RTMP") &&

                !protocol.equalsIgnoreCase("RTMPS")) {



            call.reject(

                    "Native streaming currently supports RTMP and RTMPS"

            );



            return;

        }



        String normalizedProtocol = protocol.trim().toUpperCase(java.util.Locale.US);
        String normalizedUrl = serverUrl == null ? "" : serverUrl.trim().toLowerCase(java.util.Locale.US);

        if (normalizedProtocol.equals("RTMPS") && !normalizedUrl.startsWith("rtmps://")) {
            call.reject("RTMPS requires an rtmps:// server URL.");
            return;
        }

        if (normalizedProtocol.equals("RTMP") && !normalizedUrl.startsWith("rtmp://")) {
            call.reject("RTMP requires an rtmp:// server URL.");
            return;
        }



        if (serverUrl == null ||

                serverUrl.trim().isEmpty()) {



            call.reject(

                    "Server URL is empty"

            );



            return;

        }



        if (streamKey == null ||

                streamKey.trim().isEmpty()) {



            call.reject(

                    "Stream key is empty"

            );



            return;

        }



        // If the Camera button already started the native preview, reuse the

        // exact same RootEncoder stream. Do NOT create a second camera/output.

        if (stream != null && cameraSource != null && !streaming) {

            try {

                if (tickerFilter != null) {

                    tickerFilter.setTicker(

                            tickerHeader,

                            tickerText,

                            tickerSpeed,

                            parseColor(tickerBgColor, Color.RED),

                            parseColor(tickerTextColor, Color.WHITE),

                            tickerFontSize,

                            tickerEnabled

                    );

                }



                if (chromaFilter != null) {
                    chromaFilter.setChroma(
                            chromaEnabled,
                            chromaColorType,
                            chromaCustomColor,
                            chromaTolerance,
                            chromaSmoothing,
                            chromaSpillReduction,
                            chromaBgType,
                            chromaBgSolidColor,
                            chromaBgImageUrl
                    );
                }

                if (logoFilter != null) {

                    logoFilter.setLogo(

                            logoPreset,

                            logoCustomUrl,

                            logoPosition,

                            logoSize,

                            logoOpacity,

                            logoPadding,

                            logoEnabled

                    );
            logoFilter.setLogoPosition(logoX, logoY);

                }



                currentProtocol = protocol;

                currentEndpoint = serverUrl;

                currentStreamKey = streamKey;



                String finalUrl = buildStreamingUrl(serverUrl, streamKey);

                Log.d(TAG, "Starting existing native camera stream. Endpoint=" + serverUrl + " keyLength=" + streamKey.length());

                setPreviewFullscreenInternal(true);

                stream.startStream(finalUrl);

                call.resolve();

                return;

            } catch (Exception e) {

                Log.e(TAG, "Could not start existing native camera stream", e);

                stopInternal();

                call.reject("Unable to start stream: " + e.getMessage());

                return;

            }

        }



        try {



            Log.d(

                    TAG,

                    "Starting native Camera2 RTMP stream"

            );



            Log.d(

                    TAG,

                    "Protocol: " + protocol

            );



            Log.d(

                    TAG,

                    "Resolution: " +

                            width +

                            "x" +

                            height

            );



            Log.d(

                    TAG,

                    "FPS: " + fps

            );



            Log.d(

                    TAG,

                    "Bitrate: " +

                            bitrateKbps +

                            " Kbps"

            );



            /*

             * RootEncoder RtmpStream uses Camera2Source

             * as its normal video source.

             */

            ConnectChecker checker = createConnectChecker();



            /*

             * Create RootEncoder stream.

             */

            stream =

                    new RtmpStream(

                            getContext(),

                            checker

                    );



            /*

             * Get the Camera2 video source.

             */

            if (stream.getVideoSource()

                    instanceof Camera2Source) {



                cameraSource =

                        (Camera2Source)

                                stream.getVideoSource();



            } else {



                call.reject(

                        "RootEncoder is not using Camera2Source"

                );



                stream = null;



                return;

            }



            /*

             * Select initial camera.

             *

             * Camera2Source starts with the default camera.

             * If the requested camera is front, switch once.

             */

            if ("user".equalsIgnoreCase(facing)) {



                try {



                    cameraSource.switchCamera();



                } catch (Exception e) {



                    Log.e(

                            TAG,

                            "Could not switch to front camera",

                            e

                    );

                }

            }



            /*

             * IMPORTANT:

             *

             * prepareVideo parameter order:

             *

             * width,

             * height,

             * bitrate,

             * fps,

             * iFrameInterval,

             * rotation

             */

            int bitrateBps =

                    bitrateKbps * 1000;



            int rotation = 0;



            boolean videoPrepared =

                    stream.prepareVideo(

                            width,

                            height,

                            bitrateBps,

                            fps,

                            2,

                            rotation

                    );



            if (!videoPrepared) {



                Log.e(

                        TAG,

                        "Video preparation failed"

                );



                stream =

                        null;



                cameraSource =

                        null;



                call.reject(

                        "Could not prepare video encoder"

                );



                return;

            }



            /*

             * Native preview: the same RootEncoder GL pipeline used for the

             * encoded stream is also rendered into this TextureView.

             */

            stream.getGlInterface().setAutoHandleOrientation(true);



            createPreviewView();



            /*

             * Audio.

             */

            boolean audioPrepared =

                    stream.prepareAudio(

                            44100,

                            true,

                            128 * 1024,

                            false,

                            false

                    );



            if (!audioPrepared &&

                    audioEnabled) {



                Log.e(

                        TAG,

                        "Audio preparation failed"

                );



                stream =

                        null;



                cameraSource =

                        null;



                call.reject(

                        "Could not prepare audio encoder"

                );



                return;

            }



            /*

             * Create native ticker.

             */

            chromaFilter = new ChromaKeyFilterRender();
            chromaFilter.setChroma(
                    chromaEnabled,
                    chromaColorType,
                    chromaCustomColor,
                    chromaTolerance,
                    chromaSmoothing,
                    chromaSpillReduction,
                    chromaBgType,
                    chromaBgSolidColor,
                    chromaBgImageUrl
            );
            stream.getGlInterface().addFilter(chromaFilter);



            tickerFilter =

                    new NewsTickerFilterRender();



            int bgColor =

                    parseColor(

                            tickerBgColor,

                            Color.RED

                    );



            int txtColor =

                    parseColor(

                            tickerTextColor,

                            Color.WHITE

                    );



            tickerFilter.setTicker(

                    tickerHeader,

                    tickerText,

                    tickerSpeed,

                    bgColor,

                    txtColor,

                    tickerFontSize,

                    tickerEnabled

            );



            /*

             * Add ticker AFTER camera rendering.

             *

             * Therefore YouTube receives:

             *

             * CAMERA

             * +

             * TICKER

             */

            stream.getGlInterface()

                    .addFilter(

                            tickerFilter

                    );



            logoFilter = new LogoWatermarkFilterRender();

            logoFilter.setLogo(

                    logoPreset,

                    logoCustomUrl,

                    logoPosition,

                    logoSize,

                    logoOpacity,

                    logoPadding,

                    logoEnabled

            );
            logoFilter.setLogoPosition(logoX, logoY);

            stream.getGlInterface()

                    .addFilter(

                            logoFilter

                    );



            // The preview is attached after the ticker + logo filters so both the

            // Android preview and YouTube show the identical composition.

            startPreviewIfReady();

            setPreviewFullscreenInternal(true);



            /*

             * Force GL rendering at stream FPS.

             */

            stream.getGlInterface()

                    .setForceRender(

                            true,

                            fps

                    );



            /*

             * Construct final RTMP URL.

             */

            String finalUrl =

                    buildStreamingUrl(

                            serverUrl,

                            streamKey

                    );



            currentProtocol =

                    protocol;



            currentEndpoint =

                    serverUrl;



            currentStreamKey =

                    streamKey;



            Log.d(

                    TAG,

                    "Starting stream. Endpoint=" +

                            serverUrl +

                            " keyLength=" + streamKey.length()

            );



            stream.startStream(

                    finalUrl

            );



            call.resolve();



        } catch (Exception e) {



            Log.e(

                    TAG,

                    "startStream error",

                    e

            );



            stopInternal();



            call.reject(

                    "Unable to start stream: " +

                            e.getMessage()

            );

        }

    }



    @PluginMethod

    public void stopCamera(PluginCall call) {

        // Release the native camera/preview without publishing to YouTube.

        if (stream != null && !stream.isStreaming()) {

            stopInternal();

        }

        call.resolve();

    }



    @PluginMethod

    public void stopStream(

            PluginCall call

    ) {



        stopInternal();



        call.resolve();

    }



    @PluginMethod

    public void switchCamera(

            PluginCall call

    ) {



        try {



            if (cameraSource == null) {



                call.reject(

                        "Camera is not running"

                );



                return;

            }



            /*

             * RootEncoder 2.8.1:

             *

             * switchCamera()

             *

             * has no String parameter.

             */

            cameraSource.switchCamera();
            nativeFrontCamera=!nativeFrontCamera;
            JSObject data=new JSObject();
            data.put("facing",nativeFrontCamera?"user":"environment");
            notifyListeners("cameraSwitched",data);
            keepCameraSwitchButtonVisible();

            call.resolve();



        } catch (Exception e) {



            Log.e(

                    TAG,

                    "switchCamera failed",

                    e

            );



            call.reject(

                    "Unable to switch camera: " +

                            e.getMessage()

            );

        }

    }
    @PluginMethod
    public void setChroma(PluginCall call) {
        if (chromaFilter == null) {
            call.reject("Chroma key filter is not initialized");
            return;
        }

        boolean enabled = call.getBoolean("enabled", true);
        String colorType = call.getString("colorType", "green");
        String customColor = call.getString("customColor", "#00ff00");
        float tolerance = call.getDouble("tolerance", 50.0).floatValue();
        float smoothing = call.getDouble("smoothing", 20.0).floatValue();
        float spillReduction = call.getDouble("spillReduction", 30.0).floatValue();
        String bgType = call.getString("bgType", "neon");
        String bgSolidColor = call.getString("bgSolidColor", "#10051e");
        String bgImageUrl = call.getString("bgImageUrl", "");

        chromaFilter.setChroma(
                enabled,
                colorType,
                customColor,
                tolerance,
                smoothing,
                spillReduction,
                bgType,
                bgSolidColor,
                bgImageUrl
        );

        call.resolve();
    }





    @PluginMethod

    public void setTicker(

            PluginCall call

    ) {



        if (tickerFilter == null) {



            call.reject(

                    "Ticker is not initialized"

            );



            return;

        }



        boolean enabled =

                call.getBoolean(

                        "enabled",

                        true

                );



        String header =

                call.getString(

                        "header",

                        "TICKER"

                );



        String text =

                call.getString(

                        "text",

                        "BREAKING NEWS • LIVE FROM STREAMFLOW"

                );



        String speed =

                call.getString(

                        "speed",

                        "medium"

                );



        String bg =

                call.getString(

                        "bgColor",

                        "#dc2626"

                );



        String textColor =

                call.getString(

                        "textColor",

                        "#ffffff"

                );



        int fontSize =

                call.getInt(

                        "fontSize",

                        14

                );



        tickerFilter.setTicker(

                header,

                text,

                speed,

                parseColor(bg, Color.RED),

                parseColor(textColor, Color.WHITE),

                fontSize,

                enabled

        );



        call.resolve();

    }



    @PluginMethod

    public void setLogo(PluginCall call) {

        if (logoFilter == null) {

            call.reject("Logo watermark is not initialized");

            return;

        }



        boolean enabled = call.getBoolean("enabled", true);

        String preset = call.getString("preset", "news");

        String customUrl = call.getString("customUrl", "");

        String position = call.getString("position", "top-right");

        float size = call.getDouble("size", 16.0).floatValue();

        float opacity = call.getDouble("opacity", 0.9).floatValue();

        int padding = call.getInt("padding", 12);

        float x = call.getDouble("x", 100.0).floatValue();
        float y = call.getDouble("y", 0.0).floatValue();



        logoFilter.setLogo(

                preset,

                customUrl,

                position,

                size,

                opacity,

                padding,

                enabled

        );
        logoFilter.setLogoPosition(x, y);



        call.resolve();

    }



    @PluginMethod

    public void getCameraStatus(

            PluginCall call

    ) {



        JSObject result =

                new JSObject();



        result.put(

                "nativeCameraRunning",

                cameraSource != null

        );



        result.put(

                "streaming",

                streaming

        );



        result.put(

                "protocol",

                currentProtocol

        );



        call.resolve(

                result

        );

    }



    @PluginMethod

    public void setPreviewFullscreen(PluginCall call) {

        boolean fullscreen = call.getBoolean("fullscreen", true);

        setPreviewFullscreenInternal(fullscreen);

        call.resolve();

    }



    private void setPreviewFullscreenInternal(boolean fullscreen) {

        getActivity().runOnUiThread(() -> {

            // The native broadcast stays landscape even while the React Controls & Analytics

            // page is shown in portrait. Disable automatic orientation handling while the

            // controls page is visible so Android's portrait rotation cannot rotate the stream.

            if (stream != null && cameraSource != null) {

                try {

                    if (fullscreen) {

                        getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);

                        stream.getGlInterface().setAutoHandleOrientation(true);

                        stream.getGlInterface().setStreamRotation(0);

                    } else {

                        stream.getGlInterface().setAutoHandleOrientation(false);

                        stream.getGlInterface().setStreamRotation(0);

                        getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);

                    }

                } catch (Exception e) {

                    Log.w(TAG, "Could not update UI/stream orientation", e);

                }

            }



            if (previewView == null || previewRoot == null) return;



            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(

                    fullscreen ? FrameLayout.LayoutParams.MATCH_PARENT : 1,

                    fullscreen ? FrameLayout.LayoutParams.MATCH_PARENT : 1

            );

            lp.gravity = Gravity.TOP | Gravity.START;

            previewView.setLayoutParams(lp);

            previewView.bringToFront();

            previewView.setZ(10000f);

            previewView.setTranslationZ(10000f);



            if (fullscreenControlsButton != null) {

                fullscreenControlsButton.setVisibility(fullscreen ? View.VISIBLE : View.GONE);

                if (fullscreen) {

                    fullscreenControlsButton.bringToFront();

                    fullscreenControlsButton.setZ(10001f);

                    fullscreenControlsButton.setTranslationZ(10001f);

                }

            }



            if(cameraSwitchButton!=null){
                cameraSwitchButton.setVisibility(View.VISIBLE); cameraSwitchButton.bringToFront();
                cameraSwitchButton.setZ(10002f); cameraSwitchButton.setTranslationZ(10002f);
                if(fullscreen){ FrameLayout.LayoutParams cameraLp=new FrameLayout.LayoutParams(dp(44),dp(44),Gravity.BOTTOM|Gravity.END); cameraLp.setMargins(0,0,dp(14),dp(14)); cameraSwitchButton.setLayoutParams(cameraLp); }
            }

            Window window = getActivity().getWindow();

            if (fullscreen) {

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {

                    window.setDecorFitsSystemWindows(false);

                    WindowInsetsController controller = window.getInsetsController();

                    if (controller != null) {

                        controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());

                        controller.setSystemBarsBehavior(

                                WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

                        );

                    }

                } else {

                    window.getDecorView().setSystemUiVisibility(

                            View.SYSTEM_UI_FLAG_FULLSCREEN

                                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION

                                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY

                                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN

                                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION

                                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE

                    );

                }

            } else {

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {

                    window.setDecorFitsSystemWindows(true);

                    WindowInsetsController controller = window.getInsetsController();

                    if (controller != null) {

                        controller.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());

                    }

                } else {

                    window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);

                }

            }

        });

    }



    @PluginMethod

    public void setPreviewRect(PluginCall call) {

        double x = call.getDouble("x", 0.0);

        double y = call.getDouble("y", 0.0);

        double width = call.getDouble("width", 0.0);

        double height = call.getDouble("height", 0.0);



        if (previewView == null) { call.resolve(); return; }



        getActivity().runOnUiThread(() -> {

            float density = getContext().getResources().getDisplayMetrics().density;

            // WebView getBoundingClientRect() is in CSS pixels. Capacitor's WebView

            // uses density-independent coordinates, so convert them to Android pixels.

            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(

                    Math.max(1, Math.round((float) (width * density))),

                    Math.max(1, Math.round((float) (height * density)))

            );

            lp.leftMargin = Math.round((float) (x * density));

            lp.topMargin = Math.round((float) (y * density));

            lp.gravity = Gravity.TOP | Gravity.START;

            previewView.setLayoutParams(lp);

            if (stream != null) {

                try {

                    stream.getGlInterface().setPreviewResolution(lp.width, lp.height);

                } catch (Exception e) {

                    Log.w(TAG, "Could not update native preview resolution", e);

                }

            }

            previewView.bringToFront();

            previewView.setZ(10000f);

            previewView.setTranslationZ(10000f);

            // Keep the camera switch icon attached to the embedded preview rather than
            // the bottom-right corner of the entire Android window.
            if (cameraSwitchButton != null) {
                FrameLayout.LayoutParams cameraLp = new FrameLayout.LayoutParams(
                        dp(44),
                        dp(44),
                        Gravity.TOP | Gravity.START
                );
                cameraLp.leftMargin = Math.max(0, lp.leftMargin + lp.width - dp(58));
                cameraLp.topMargin = Math.max(0, lp.topMargin + lp.height - dp(58));
                cameraSwitchButton.setLayoutParams(cameraLp);
                cameraSwitchButton.bringToFront();
                cameraSwitchButton.setZ(10002f);
                cameraSwitchButton.setTranslationZ(10002f);
            }

        });

        call.resolve();

    }



    @PluginMethod

    public void setPreviewVisible(PluginCall call) {

        boolean visible = call.getBoolean("visible", false);

        getActivity().runOnUiThread(() -> {

            if (previewView != null) previewView.setVisibility(visible ? TextureView.VISIBLE : TextureView.GONE);
            if (cameraSwitchButton != null) { cameraSwitchButton.setVisibility(visible ? View.VISIBLE : View.GONE); if (visible) keepCameraSwitchButtonVisible(); }

        });

        call.resolve();

    }



    private static class CameraSwitchDrawable extends android.graphics.drawable.Drawable {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path path = new Path();
        @Override public void draw(Canvas c) {
            float w=getBounds().width(), h=getBounds().height();
            float cx=getBounds().centerX(), cy=getBounds().centerY();
            float r=Math.min(w,h)*0.28f;
            paint.setStyle(Paint.Style.STROKE);
            paint.setColor(Color.WHITE);
            paint.setStrokeWidth(Math.max(2f, Math.min(w,h)*0.075f));
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setStrokeJoin(Paint.Join.ROUND);
            RectF rect=new RectF(cx-r,cy-r,cx+r,cy+r);
            c.drawArc(rect,205f,145f,false,paint);
            c.drawArc(rect,25f,145f,false,paint);
            paint.setStyle(Paint.Style.FILL);
            path.reset();
            path.moveTo(cx-r-1,cy-1); path.lineTo(cx-r+7,cy-7); path.lineTo(cx-r+6,cy+4); path.close();
            c.drawPath(path,paint);
            path.reset();
            path.moveTo(cx+r+1,cy+1); path.lineTo(cx+r-7,cy+7); path.lineTo(cx+r-6,cy-4); path.close();
            c.drawPath(path,paint);
        }
        @Override public void setAlpha(int a){paint.setAlpha(a);invalidateSelf();}
        @Override public void setColorFilter(android.graphics.ColorFilter f){paint.setColorFilter(f);invalidateSelf();}
        @Override public int getOpacity(){return android.graphics.PixelFormat.TRANSLUCENT;}
    }

    private void keepCameraSwitchButtonVisible(){
        if(cameraSwitchButton==null||previewRoot==null)return;
        cameraSwitchButton.setVisibility(View.VISIBLE); cameraSwitchButton.bringToFront();
        cameraSwitchButton.setZ(10002f); cameraSwitchButton.setTranslationZ(10002f);
        cameraSwitchButton.postDelayed(()->{ if(cameraSwitchButton!=null&&previewRoot!=null){
            cameraSwitchButton.setVisibility(View.VISIBLE); cameraSwitchButton.bringToFront();
            cameraSwitchButton.setZ(10002f); cameraSwitchButton.setTranslationZ(10002f);
        }},150);
    }

    private void createPreviewView() {

        getActivity().runOnUiThread(() -> {

            if (previewView != null) {

                previewView.setVisibility(TextureView.VISIBLE);

                startPreviewIfReady();

                return;

            }

            previewRoot = getActivity().findViewById(android.R.id.content);

            if (previewRoot == null) return;



            previewView = new TextureView(getContext());

            previewView.setOpaque(false);

            previewView.setZ(10000f);

            previewView.setTranslationZ(10000f);



            // The native camera is a full-screen touch shield.

            // Consume all touches so the React/WebView controls underneath

            // cannot receive taps while the live camera is visible.

            previewView.setClickable(true);

            previewView.setFocusable(true);

            previewView.setFocusableInTouchMode(true);

            previewView.setOnTouchListener((v, event) -> true);



            previewView.setVisibility(TextureView.VISIBLE);

            previewView.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {

                @Override public void onSurfaceTextureAvailable(android.graphics.SurfaceTexture surface, int width, int height) { startPreviewIfReady(); }

                @Override public void onSurfaceTextureSizeChanged(android.graphics.SurfaceTexture surface, int width, int height) {

                    if (stream != null && previewStarted) {

                        try { stream.getGlInterface().setPreviewResolution(width, height); } catch (Exception ignored) {}

                    }

                }

                @Override public boolean onSurfaceTextureDestroyed(android.graphics.SurfaceTexture surface) { previewStarted = false; return true; }

                @Override public void onSurfaceTextureUpdated(android.graphics.SurfaceTexture surface) {}

            });

            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(1, 1);

            lp.gravity = Gravity.TOP | Gravity.START;

            previewRoot.addView(previewView, lp);

            previewView.bringToFront();

            cameraSwitchButton = new Button(getContext());
            cameraSwitchButton.setText("");
            cameraSwitchButton.setContentDescription("Switch Camera");
            cameraSwitchButton.setBackground(new CameraSwitchDrawable());
            cameraSwitchButton.setPadding(0,0,0,0);
            cameraSwitchButton.setVisibility(View.VISIBLE);
            cameraSwitchButton.setZ(10002f);
            cameraSwitchButton.setTranslationZ(10002f);
            cameraSwitchButton.setOnClickListener(v -> {
                try {
                    if(cameraSource==null)return;
                    cameraSource.switchCamera();
                    nativeFrontCamera=!nativeFrontCamera;
                    JSObject data=new JSObject();
                    data.put("facing",nativeFrontCamera?"user":"environment");
                    notifyListeners("cameraSwitched",data);
                    keepCameraSwitchButtonVisible();
                }catch(Exception e){Log.e(TAG,"Camera switch button failed",e);}
            });
            FrameLayout.LayoutParams cameraLp=new FrameLayout.LayoutParams(dp(44),dp(44),Gravity.BOTTOM|Gravity.END);
            cameraLp.setMargins(0,0,dp(14),dp(14));
            previewRoot.addView(cameraSwitchButton,cameraLp);
            keepCameraSwitchButtonVisible();



            // Native settings button shown only while the camera preview is full-screen.

            // It sits above the TextureView because the TextureView itself is a native view

            // and would otherwise cover any React/WebView button.

            fullscreenControlsButton = new Button(getContext());

            fullscreenControlsButton.setText("⚙");

            fullscreenControlsButton.setTextColor(Color.WHITE);

            fullscreenControlsButton.setTextSize(22f);

            fullscreenControlsButton.setGravity(Gravity.CENTER);

            fullscreenControlsButton.setAllCaps(false);

            fullscreenControlsButton.setPadding(0, 0, 0, 1);

            fullscreenControlsButton.setContentDescription("Open Controls and Analytics");

            fullscreenControlsButton.setVisibility(View.GONE);

            fullscreenControlsButton.setZ(10001f);

            fullscreenControlsButton.setTranslationZ(10001f);



            GradientDrawable settingsBg = new GradientDrawable();

            settingsBg.setShape(GradientDrawable.OVAL);

            settingsBg.setColor(Color.argb(185, 20, 20, 20));

            settingsBg.setStroke(dp(1), Color.argb(110, 255, 255, 255));

            fullscreenControlsButton.setBackground(settingsBg);



            fullscreenControlsButton.setOnClickListener(v -> {

                Log.d(TAG, "Fullscreen controls button pressed");

                JSObject data = new JSObject();

                data.put("page", "controls");

                notifyListeners("controlsRequested", data);

            });



            FrameLayout.LayoutParams settingsLp = new FrameLayout.LayoutParams(

                    dp(52),

                    dp(52),

                    Gravity.TOP | Gravity.END

            );

            settingsLp.setMargins(0, dp(16), dp(16), 0);

            previewRoot.addView(fullscreenControlsButton, settingsLp);

            fullscreenControlsButton.bringToFront();

        });

    }



    private void startPreviewIfReady() {

        if (stream == null || previewView == null || previewStarted) {

            return;

        }



        // TextureView can exist before its SurfaceTexture is actually ready.

        // Do not give up in that case; wait for the surface and retry.

        if (!previewView.isAvailable()) {

            Log.d(TAG, "Native preview surface not ready yet. Waiting...");



            previewView.postDelayed(() -> {

                if (stream != null && previewView != null && !previewStarted) {

                    startPreviewIfReady();

                }

            }, 100);



            return;

        }



        try {

            stream.startPreview(previewView);

            previewStarted = true;

            Log.d(TAG, "Native RootEncoder preview attached to Android UI");

        } catch (Exception e) {

            Log.e(TAG, "Could not start native preview. Retrying...", e);



            previewView.postDelayed(() -> {

                if (stream != null && previewView != null && !previewStarted) {

                    startPreviewIfReady();

                }

            }, 250);

        }

    }



    private void removePreviewView() {

        getActivity().runOnUiThread(() -> {

            previewStarted = false;

            if (fullscreenControlsButton != null) {

                if (previewRoot != null) previewRoot.removeView(fullscreenControlsButton);

                fullscreenControlsButton = null;

            }

            if (cameraSwitchButton != null) {
                if (previewRoot != null) previewRoot.removeView(cameraSwitchButton);
                cameraSwitchButton = null;
            }
            if (previewView != null) {

                if (previewRoot != null) previewRoot.removeView(previewView);

                previewView = null;

            }

            previewRoot = null;

        });

    }



    private int dp(int value) {

        float density = getContext().getResources().getDisplayMetrics().density;

        return Math.round(value * density);

    }



    private String buildStreamingUrl(

            String serverUrl,

            String streamKey

    ) {

        String endpoint = serverUrl == null ? "" : serverUrl.trim();
        String key = streamKey == null ? "" : streamKey.trim();

        if (endpoint.isEmpty() || key.isEmpty()) {
            throw new IllegalArgumentException("Server URL and stream key are required");
        }

        // Accept either a base YouTube ingest URL + separate key (the normal
        // configuration), or a complete URL that already ends with the key.
        String endpointWithoutTrailingSlash = endpoint.endsWith("/")
                ? endpoint.substring(0, endpoint.length() - 1)
                : endpoint;

        if (endpointWithoutTrailingSlash.endsWith("/" + key)) {
            return endpointWithoutTrailingSlash;
        }

        return endpointWithoutTrailingSlash + "/" + key;
    }



    private int parseColor(

            String color,

            int fallback

    ) {



        try {



            if (color == null ||

                    color.trim().isEmpty()) {



                return fallback;

            }



            return Color.parseColor(

                    color

            );



        } catch (Exception e) {



            return fallback;

        }

    }



    private void notifyConnection(

            String state,

            String message

    ) {



        JSObject data =

                new JSObject();



        data.put(

                "state",

                state

        );



        data.put(

                "message",

                message

        );



        notifyListeners(

                "streamConnection",

                data

        );

    }



    private void stopInternal() {



        // Hide the preview first, then release the camera/stream and finally return

        // the Android activity to its normal orientation behavior.

        setPreviewFullscreenInternal(false);

        getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);

        removePreviewView();



        try {



            if (stream != null) {



                if (stream.isStreaming()) {



                    stream.stopStream();

                }



                try {



                    stream.getGlInterface()

                            .clearFilters();



                } catch (Exception ignored) {

                }



                try {



                    stream.release();



                } catch (Exception ignored) {

                }

            }



            logoFilter = null;

            tickerFilter = null;



        } catch (Exception e) {



            Log.e(

                    TAG,

                    "Error stopping stream",

                    e

            );

        }



        tickerFilter =

                null;



        cameraSource =

                null;



        stream =

                null;



        streaming =

                false;



        currentProtocol =

                "";



        currentEndpoint =

                "";



        currentStreamKey =

                "";

    }

}