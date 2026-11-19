package __PACKAGE__;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.io.IOException;
import java.util.Map;

/**
 * Generado por todo2todo.
 *
 * Capacitor responde index.html a toda ruta sin extensión, lo que sirve para
 * una SPA pero no para sitios multipágina (Next, Nuxt): /acerca debe mostrar
 * acerca.html o acerca/index.html, y las rutas no prerenderizadas de Nuxt usan
 * 200.html (su index.html es la página de inicio). Reescribimos esas peticiones y dejamos que
 * Capacitor las atienda, así sigue inyectando su puente JS.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        bridge.setWebViewClient(
            new BridgeWebViewClient(bridge) {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    String page = staticPage(request.getUrl());
                    return super.shouldInterceptRequest(view, page == null ? request : withPath(request, page));
                }
            }
        );
    }

    private String staticPage(Uri url) {
        String path = url.getPath();
        String last = url.getLastPathSegment();
        if (!bridge.getHost().equals(url.getHost()) || path == null || last == null || last.contains(".")) {
            return null;
        }
        String base = path.endsWith("/") ? path.substring(0, path.length() - 1) : path;
        for (String candidate : new String[] { base + ".html", base + "/index.html", "/200.html" }) {
            if (assetExists("public" + candidate)) return candidate;
        }
        return null;
    }

    private boolean assetExists(String asset) {
        try {
            getAssets().open(asset).close();
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    private static WebResourceRequest withPath(WebResourceRequest original, String path) {
        Uri url = original.getUrl().buildUpon().path(path).build();
        return new WebResourceRequest() {
            @Override
            public Uri getUrl() {
                return url;
            }

            @Override
            public boolean isForMainFrame() {
                return original.isForMainFrame();
            }

            @Override
            public boolean isRedirect() {
                return original.isRedirect();
            }

            @Override
            public boolean hasGesture() {
                return original.hasGesture();
            }

            @Override
            public String getMethod() {
                return original.getMethod();
            }

            @Override
            public Map<String, String> getRequestHeaders() {
                return original.getRequestHeaders();
            }
        };
    }
}
