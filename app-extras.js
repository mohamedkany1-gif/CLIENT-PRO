/* CLIENT PRO Notifications
Capacitor 7
*/

(function () {
'use strict';

const PLUGIN = () =>
window.Capacitor?.Plugins?.LocalNotifications;

const CHANNEL_ID = 'clientpro-reminders-v3';
const ACTION_TYPE = 'CLIENTPRO_REMINDER_ACTIONS';
const STORAGE_KEY = 'clientpro_scheduled_notification_ids_v3';

let initialized = false;
let initializing = null;
let actionListenerRegistered = false;

function isNative() {
return !!(
window.Capacitor &&
window.Capacitor.isNativePlatform?.()
);
}

function getStoredIds() {
try {
const value = JSON.parse(
localStorage.getItem(STORAGE_KEY) || '[]'
);

  return Array.isArray(value) ? value : [];
} catch (_) {
  return [];
}

}

function saveStoredIds(ids) {
try {
localStorage.setItem(
STORAGE_KEY,
JSON.stringify([...new Set(ids)])
);
} catch (error) {
console.warn('Notification storage:', error);
}
}

function notificationId(customerId) {
let hash = 0;
const value = String(customerId);

for (let i = 0; i < value.length; i++) {
  hash = ((hash << 5) - hash) + value.charCodeAt(i);
  hash |= 0;
}

return Math.abs(hash) % 2000000000 || 1;

}

async function createChannel() {
const plugin = PLUGIN();

if (!plugin || !isNative()) return;

try {
  await plugin.createChannel({
    id: CHANNEL_ID,
    name: 'تذكيرات العملاء',
    description: 'تنبيهات مواعيد زيارات العملاء',
    importance: 5,
    visibility: 1,
    vibration: true
  });
} catch (error) {
  console.warn('Notification channel:', error);
}

}

async function registerActions() {
const plugin = PLUGIN();

if (!plugin || !isNative()) return;

try {
  await plugin.registerActionTypes({
    types: [
      {
        id: ACTION_TYPE,
        actions: [
          {
            id: 'DONE',
            title: 'تم'
          },
          {
            id: 'SNOOZE',
            title: 'تأجيل 10 د'
          },
          {
            id: 'STOP',
            title: 'إيقاف'
          }
        ]
      }
    ]
  });
} catch (error) {
  console.warn('Notification actions:', error);
}

}

async function requestPermission() {
const plugin = PLUGIN();

if (!plugin || !isNative()) {
  if ('Notification' in window) {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

try {
  const current = await plugin.checkPermissions();

  if (current.display === 'granted') {
    return true;
  }

  const requested = await plugin.requestPermissions();

  return requested.display === 'granted';
} catch (error) {
  console.error('Notification permission:', error);
  return false;
}

}

async function cancelNotification(id) {
const plugin = PLUGIN();

if (!plugin || !isNative()) return;

try {
  await plugin.cancel({
    notifications: [{ id }]
  });
} catch (_) {}

try {
  await plugin.removeDeliveredNotifications({
    notifications: [{ id }]
  });
} catch (_) {}

}

async function cancelCustomer(customerId) {
if (!customerId) return;

const id = notificationId(customerId);

await cancelNotification(id);

const ids = getStoredIds().filter(
  storedId => Number(storedId) !== id
);

saveStoredIds(ids);

}

async function scheduleReminder(customer) {
const plugin = PLUGIN();

if (!plugin || !isNative()) return false;

if (!customer?.id || !customer?.reminder_at) {
  return false;
}

const reminderDate = new Date(customer.reminder_at);

if (Number.isNaN(reminderDate.getTime())) {
  return false;
}

if (reminderDate.getTime() <= Date.now()) {
  return false;
}

const id = notificationId(customer.id);

await cancelNotification(id);

const name = customer.name || 'عميل';

const device = customer.device_type
  ? `، الجهاز: ${customer.device_type}`
  : '';

try {
  await plugin.schedule({
    notifications: [
      {
        id,
        title: `تذكير زيارة العميل ${name}`,
        body: `موعد الزيارة المحدد${device}`,
        schedule: {
          at: reminderDate,
          allowWhileIdle: true
        },
        channelId: CHANNEL_ID,
        actionTypeId: ACTION_TYPE,
        ongoing: false,
        autoCancel: true,
        extra: {
          clientproReminder: true,
          customerId: String(customer.id),
          reminderAt: customer.reminder_at
        }
      }
    ]
  });

  return true;
} catch (error) {
  console.error('Schedule reminder error:', error);
  return false;
}

}

async function sync(customers) {
const plugin = PLUGIN();

if (!plugin || !isNative()) return;

if (!Array.isArray(customers)) return;

const allowed = await requestPermission();

if (!allowed) {
  console.warn('Notifications permission not granted');
  return;
}

const oldIds = getStoredIds();

for (const oldId of oldIds) {
  await cancelNotification(Number(oldId));
}

const newIds = [];

for (const customer of customers) {
  if (!customer?.id || !customer?.reminder_at) {
    continue;
  }

  try {
    const success = await scheduleReminder(customer);

    if (success) {
      newIds.push(notificationId(customer.id));
    }
  } catch (error) {
    console.error(
      'Reminder sync error:',
      customer.id,
      error
    );
  }
}

saveStoredIds(newIds);

console.log(
  'CLIENT PRO reminders synced:',
  newIds.length
);

}

async function removeDelivered(id) {
const plugin = PLUGIN();

if (!plugin || !isNative()) return;

try {
  await plugin.removeDeliveredNotifications({
    notifications: [{ id }]
  });
} catch (_) {}

}

async function handleAction(event) {
const notification = event?.notification;

if (!notification) return;

const actionId = event.actionId;

if (!['DONE', 'SNOOZE', 'STOP'].includes(actionId)) {
  return;
}

const extra = notification.extra || {};

if (!extra.clientproReminder) return;

const detail = {
  action: actionId,
  customerId: extra.customerId || null,
  reminderAt: extra.reminderAt || null,
  notificationId: notification.id
};

window.dispatchEvent(
  new CustomEvent('clientpro:reminder-action', {
    detail
  })
);

await removeDelivered(notification.id);

if (actionId === 'STOP' || actionId === 'DONE') {
  await cancelCustomer(extra.customerId);
}

}

async function initialize() {
if (initialized) return;

if (initializing) {
  return initializing;
}

const plugin = PLUGIN();

if (!plugin || !isNative()) {
  initialized = true;
  return;
}

initializing = (async () => {
  try {
    await createChannel();
    await registerActions();

    if (!actionListenerRegistered) {
      await plugin.addListener(
        'localNotificationActionPerformed',
        handleAction
      );

      actionListenerRegistered = true;
    }

    initialized = true;

    console.log(
      'CLIENT PRO notifications initialized'
    );
  } catch (error) {
    console.error(
      'Notification initialization:',
      error
    );
  } finally {
    initializing = null;
  }
})();

return initializing;

}

async function checkExactAlarm() {
const plugin = PLUGIN();

if (!plugin || !isNative()) return null;

try {
  return await plugin.checkExactNotificationSetting();
} catch (error) {
  console.warn('Exact alarm check:', error);
  return null;
}

}

window.ClientProNotifications = {
initialize,
requestPermission,
scheduleReminder,
sync,
cancelCustomer,
checkExactAlarm,
notificationId
};

})();
