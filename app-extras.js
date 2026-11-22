/* CLIENT PRO Notifications
   Capacitor 7
*/

(function () {
  'use strict';

  const PLUGIN = () =>
    window.Capacitor?.Plugins?.LocalNotifications;

  const CHANNEL_ID = 'clientpro-reminders-v2';
  const ACTION_TYPE = 'CLIENTPRO_REMINDER_ACTIONS';
  const NOTIFICATION_PREFIX = 'clientpro_';

  let initialized = false;

  function isNative() {
    return !!(
      window.Capacitor &&
      window.Capacitor.isNativePlatform?.()
    );
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
        vibration: true,
        sound: 'clientpro_reminder.wav'
      });
    } catch (error) {
      console.warn('Notification channel:', error);
    }
  }

  async function registerActions() {
    const plugin = PLUGIN();
    if (!plugin || !isNative()) return;

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
  }

  async function requestPermission() {
    const plugin = PLUGIN();

    if (!plugin || !isNative()) {
      if ('Notification' in window) {
        return await Notification.requestPermission();
      }
      return false;
    }

    const current = await plugin.checkPermissions();

    if (current.display !== 'granted') {
      const requested = await plugin.requestPermissions();

      if (requested.display !== 'granted') {
        return false;
      }
    }

    return true;
  }

  async function scheduleReminder(customer) {
    const plugin = PLUGIN();

    if (!plugin || !isNative()) return;

    if (!customer?.id || !customer?.reminder_at) return;

    const reminderDate = new Date(customer.reminder_at);

    if (Number.isNaN(reminderDate.getTime())) return;
    if (reminderDate.getTime() <= Date.now()) return;

    const id = notificationId(customer.id);

    try {
      await plugin.cancel({
        notifications: [{ id }]
      });
    } catch (_) {}

    const name = customer.name || 'عميل';
    const device = customer.device_type
      ? `، الجهاز: ${customer.device_type}`
      : '';

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
            customerId: String(customer.id),
            reminderAt: customer.reminder_at
          }
        }
      ]
    });
  }

  async function sync(customers) {
    const plugin = PLUGIN();

    if (!plugin || !isNative()) return;

    if (!Array.isArray(customers)) return;

    for (const customer of customers) {
      try {
        const id = notificationId(customer.id);

        await plugin.cancel({
          notifications: [{ id }]
        });

        if (customer.reminder_at) {
          await scheduleReminder(customer);
        }
      } catch (error) {
        console.error(
          'Reminder sync error:',
          customer.id,
          error
        );
      }
    }
  }

  async function removeDelivered(id) {
    const plugin = PLUGIN();
    if (!plugin) return;

    try {
      await plugin.removeDeliveredNotifications({
        notifications: [{ id }]
      });
    } catch (_) {}
  }

  async function handleAction(event) {
    const notification = event.notification;
    const actionId = event.actionId;

    if (!notification) return;

    const extra = notification.extra || {};

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

    if (actionId === 'STOP') {
      await removeDelivered(notification.id);
    }
  }

  async function initialize() {
    if (initialized) return;

    const plugin = PLUGIN();

    if (!plugin || !isNative()) {
      initialized = true;
      return;
    }

    try {
      await createChannel();
      await registerActions();

      await plugin.addListener(
        'localNotificationActionPerformed',
        handleAction
      );

      initialized = true;
      console.log('CLIENT PRO notifications initialized');
    } catch (error) {
      console.error('Notification initialization:', error);
    }
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
    checkExactAlarm,
    notificationId
  };

})();
