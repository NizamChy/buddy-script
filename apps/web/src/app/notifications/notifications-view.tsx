"use client";

import { AppShell } from "@/components/app-shell";
import { MarkAllReadButton, NotificationList } from "@/components/notifications";

export function NotificationsView() {
  return (
    <AppShell>
      {() => (
        <section
          className="_feed_inner_area _b_radious6 _padd_t24 _padd_b24 _padd_r24 _padd_l24 _mar_b16"
          aria-labelledby="notifications-title"
        >
          <div className="_notifications_content">
            <h1 id="notifications-title" className="_notifications_content_title mb-0">
              Notifications
            </h1>
            <MarkAllReadButton className="text-sm text-[#1890ff] hover:underline disabled:text-[#999] disabled:no-underline" />
          </div>
          <NotificationList />
        </section>
      )}
    </AppShell>
  );
}
