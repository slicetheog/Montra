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

    /// Fixes a confirmed bug: AirPlay screen mirroring was replacing the
    /// phone's own portrait UI with an edge-to-edge *widescreen* render of
    /// this app's desktop layout on the TV, not a mirror at all — confirmed
    /// by seeing the sidebar-based desktop layout fill the TV screen, and
    /// confirmed specific to this app's embedded WKWebView (mobile Safari
    /// mirrors the same site correctly). That fingerprint matches a real,
    /// documented WebKit bug (webkit.org bug 170595: "window.innerWidth/
    /// innerHeight are bogus after resize/orientationchange in WKWebView
    /// (but not MobileSafari)"). This app's WKWebView *is* its window's
    /// root view (see CAPBridgeViewController.loadView, `view = webView`),
    /// sized from the window's own bounds — those never actually change for
    /// AirPlay (there's no external-display scene here), but the display
    /// reconfiguration AirPlay triggers is apparently enough to make
    /// WebKit's internal layout viewport latch onto a wrong, wider value
    /// and never recover on its own — which is exactly what flips this
    /// app's Tailwind `md:`/`lg:` breakpoints into their desktop layout.
    ///
    /// `UIScreen.capturedDidChangeNotification`/`isCaptured` fire for
    /// AirPlay mirroring, screen recording, and QuickTime capture over
    /// cable alike — recomputing layout in response to any of them is
    /// harmless.
    private func observeScreenCapture() {
        screenCaptureObserver = NotificationCenter.default.addObserver(
            forName: UIScreen.capturedDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard UIScreen.main.isCaptured else { return }
            self?.resetWebViewViewport()
        }
    }

    /// Toggles the web view's frame through a different size and back to
    /// its real, correct size (the window's own bounds), which forces
    /// WebKit to recompute layout — and therefore every CSS media query —
    /// against the view's *current* bounds. Simply re-assigning the same
    /// frame value is a no-op UIKit can (and does) skip, which is why this
    /// dips the width by a single, imperceptible point first. Done twice
    /// (immediately, then again after the AirPlay handshake has had time to
    /// settle) since the exact moment WebKit's layout viewport gets stuck
    /// relative to the notification isn't documented.
    private func resetWebViewViewport() {
        guard let webView = (window?.rootViewController as? CAPBridgeViewController)?.webView,
              let window = window else { return }
        for delay in [0.0, 1.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                let correctFrame = window.bounds
                webView.frame = CGRect(
                    origin: correctFrame.origin,
                    size: CGSize(width: correctFrame.width - 1, height: correctFrame.height)
                )
                webView.layoutIfNeeded()
                webView.frame = correctFrame
                webView.layoutIfNeeded()
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
