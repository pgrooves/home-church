package com.homechurchnola.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/* Opens a PDF the app has just written in the phone's own PDF viewer.

   WHY ANDROID NEEDS THIS AND AN IPHONE DOES NOT. Download guide hands the PDF
   to the share sheet (js/native.js). On an iPhone that sheet has Print and
   Save to Files, so the guide can be opened from right there. Android's
   share sheet is only "send to": the file sits at the top as a preview that
   does nothing when tapped, and the only way to read the guide was to email
   or text it to yourself. So on Android the app opens the PDF instead, in
   whatever app the phone uses for PDFs, which has its own share and print.

   Only files in the app's own cache, which is the one folder the FileProvider
   in AndroidManifest.xml (res/xml/file_paths.xml) offers to other apps
   anyway. No permission is needed: the viewer gets read access to this one
   file and nothing else.

   If the phone has no PDF viewer, this rejects and js/native.js falls back to
   the share sheet, which is what Android did before. */
@CapacitorPlugin(name = "PdfViewer")
public class PdfViewerPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("No file to open.");
            return;
        }

        try {
            String path = Uri.parse(url).getPath();
            if (path == null) {
                call.reject("No file to open.");
                return;
            }

            File file = new File(path).getCanonicalFile();
            File cache = getContext().getCacheDir().getCanonicalFile();
            if (!file.getPath().startsWith(cache.getPath() + File.separator) || !file.isFile()) {
                call.reject("Only the app's own documents can be opened.");
                return;
            }

            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/pdf");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("No app on this phone opens PDFs.", "NO_VIEWER");
        } catch (Exception e) {
            call.reject("Could not open the PDF.", e);
        }
    }
}
