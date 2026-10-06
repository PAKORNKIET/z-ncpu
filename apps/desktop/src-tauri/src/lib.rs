// แอป Windows ห่อ build เดียวกับเว็บ (Spec ส่วน 3)
// M1: เพิ่ม tauri-plugin-fs และ tauri-plugin-dialog สำหรับ ProjectStorage (Spec ส่วน 15)

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("เปิดแอป Z-NCPU ไม่สำเร็จ");
}
