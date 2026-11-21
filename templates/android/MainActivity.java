package __PACKAGE__;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

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
        for (String candidate : new String[] { base + ".html", base + "/index.html" }) {
            if (assetExists("public" + candidate)) return candidate;
        }
        for (String[] route : clientRoutes()) {
            if (Pattern.compile(route[0]).matcher(path).find() && assetExists("public/" + route[1])) {
                return "/" + route[1];
            }
        }
        return assetExists("public/200.html") ? "/200.html" : null;
    }

    private List<String[]> routes;

    /**
     * Rutas de solo cliente con su propia página (p.ej. Gatsby: /productos/:id →
     * productos/[id]/index.html). Las escribe el adaptador al compilar.
     */
    private List<String[]> clientRoutes() {
        if (routes != null) return routes;
        routes = new ArrayList<>();
        try (InputStream in = getAssets().open("public/todo2todo-routes.json")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            for (int n; (n = in.read(buffer)) > 0; ) out.write(buffer, 0, n);
            JSONArray list = new JSONArray(out.toString("UTF-8"));
            for (int i = 0; i < list.length(); i++) {
                JSONObject r = list.getJSONObject(i);
                routes.add(new String[] { r.getString("pattern"), r.getString("file") });
            }
        } catch (IOException | JSONException e) {
            // Sin archivo de rutas: solo se usa 200.html.
        }
        return routes;
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
