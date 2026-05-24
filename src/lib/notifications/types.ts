export type ApiNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  deeplink: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type ApiNotificationsListResponse = {
  items: ApiNotification[];
  next_cursor: string | null;
  unread_count: number;
};

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  deeplink: string | null;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};
