# v1.5.13 screen review

Captured with Chromium from source `3d304f0a983432c87ca8613c62506565b7ea4a8d` in [read-only precheck](https://github.com/kumakumapon/MiniStr/actions/runs/43455020723). Desktop 1280px Japanese and mobile 390px English, reduced motion, fixed demo seed42. Canvas and DOM were visually inspected. All four corners fit after adjusting Fit to the viewport height. Controls and folded tools do not overlap the board. The subsequent source commit adds cancellation on returning from setup, without changing these visuals.

![Desktop Japanese](desktop-ja.jpg)

![Mobile English](mobile-en.jpg)
