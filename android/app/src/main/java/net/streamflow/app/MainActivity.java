package net.streamflow.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeStreamingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}