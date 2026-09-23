import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    private var screenCaptureObserver: NSObjectProtocol?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        observeScreenCapture()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    /// Mitigates a real, documented WKWebView bug (WebKit bug 142583; also
    /// reported specifically for AirPlay/screen-mirroring, where an
    /// embedded WebView's compositor stops presenting new frames after a
    /// display reconfiguration — the page keeps running, but the AirPlay
    /// output freezes on whatever was on screen when mirroring started,
    /// e.g. the home/dashboard route). Safari's own browser engine
    /// doesn't show this, only a bare embedded WKWebView like this app's —
    /// see globals.css's paired #main-content fix on the web side. Not a
    /// guaranteed fix for a poorly-documented compositor bug; this is a
    /// best-effort second line of defense.
    ///
    /// `UIScreen.capturedDidChangeNotification`/`isCaptured` fire for
    /// AirPlay mirroring, screen recording, and QuickTime capture over
    /// cable alike — nudging a repaint in response to any of them is
    /// harmless.
    private func observeScreenCapture() {
        screenCaptureObserver = NotificationCenter.default.addObserver(
            forName: UIScreen.capturedDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard UIScreen.main.isCaptured else { return }
            self?.nudgeWebViewToForceRepaint()
        }
    }

    /// Imperceptibly bumps the web view's scroll offset and immediately
    /// reverts it, which forces WebKit to recompute and repaint the
    /// visible layer rather than reuse whatever stale frame it composited
    /// last — a well-known community workaround for a "stuck" WKWebView
    /// render, done twice (immediately, then again after the AirPlay
    /// handshake has had time to settle) since the exact moment the
    /// compositor gets stuck relative to the notification isn't
    /// documented.
    private func nudgeWebViewToForceRepaint() {
        guard let webView = (window?.rootViewController as? CAPBridgeViewController)?.webView else { return }
        for delay in [0.0, 1.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                let scrollView = webView.scrollView
                let original = scrollView.contentOffset
                scrollView.setContentOffset(CGPoint(x: original.x, y: original.y + 1), animated: false)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                    scrollView.setContentOffset(original, animated: false)
                }
            }
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
