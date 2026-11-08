package com.homechurchnola.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own Android-only plugin. Registered before super.onCreate,
        // which is when Capacitor builds the bridge. PdfViewerPlugin.java says why.
        registerPlugin(PdfViewerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
