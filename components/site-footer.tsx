export function SiteFooter({ clearTabBar = false }: { clearTabBar?: boolean }) {
  return (
    <footer data-m={clearTabBar ? "footer app-footer" : "footer"} className="px-4 py-6 text-center text-[13px] text-[#8b93a7]">
      © 2026 by Sapian
    </footer>
  );
}
