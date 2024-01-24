package ninja.sketchmate.app;

import androidx.annotation.NonNull;

import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import android.app.Activity;
import android.content.SharedPreferences;


import java.util.Map;

public class CustomMessagingService extends FirebaseMessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
//        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
        if (remoteMessage.getData().size() == 0) return;
        String type = remoteMessage.getData().get("type");
        String mateID = remoteMessage.getData().get("mate_id");
        if ("unmatch".equals(type)) {
            String unmatcher = remoteMessage.getData().get("unmatcher");
            Widget.handleUnmatch(getApplicationContext(), mateID, unmatcher);
        } else if ("message".equals(type)) {
            String imageUrl = remoteMessage.getData().get("image_url");
            String inboxId = remoteMessage.getData().get("inbox_id");
            Widget.handleDrawingReceived(getApplicationContext(), mateID, imageUrl, inboxId);
        }
    }

    @Override
    public void onNewToken(@NonNull String s) {
        super.onNewToken(s);
        PushNotificationsPlugin.onNewToken(s);
    }
}
