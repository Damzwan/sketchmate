package ninja.sketchmate.app;

import android.content.Intent;
import android.widget.RemoteViewsService;

// WidgetGridService.java
public class WidgetGridService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new WidgetGridFactory(getApplicationContext(), intent);
    }

}
