// ซ่อนหน้าต่าง console บน Windows ตอน release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    z_ncpu_desktop_lib::run()
}
