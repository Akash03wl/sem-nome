//! Geometria de janelas: onde colocar o pop-up num monitor.

/// Retângulo em pixels físicos.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: u32,
    pub h: u32,
}

/// Canto superior esquerdo (pixels físicos) para centralizar uma janela de
/// tamanho lógico `logical_w`×`logical_h` no `monitor`, sem sair dele.
pub fn center_in_monitor(monitor: Rect, logical_w: u32, logical_h: u32, scale: f64) -> (i32, i32) {
    let axis = |origin: i32, span: u32, logical: u32| -> i32 {
        let size = (logical as f64 * scale).round() as i64;
        let free = span as i64 - size;
        // Se a janela não cabe, encosta no início do monitor em vez de sair dele.
        origin + (free.max(0) / 2) as i32
    };
    (
        axis(monitor.x, monitor.w, logical_w),
        axis(monitor.y, monitor.h, logical_h),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn center_in_monitor_primary_100pct() {
        let m = Rect { x: 0, y: 0, w: 1920, h: 1080 };
        assert_eq!(center_in_monitor(m, 720, 452, 1.0), (600, 314));
    }
    #[test]
    fn center_in_monitor_scaled_second_screen() {
        let m = Rect { x: 1920, y: 0, w: 2560, h: 1440 };
        assert_eq!(center_in_monitor(m, 720, 452, 1.5), (1920 + 740, 381));
    }
    #[test]
    fn center_in_monitor_never_offscreen() {
        let m = Rect { x: 0, y: 0, w: 800, h: 600 };
        assert_eq!(center_in_monitor(m, 720, 452, 1.5), (0, 0));
    }
}
