package ninja.sketchmate.app;

import android.os.Parcel;
import android.os.Parcelable;

public class Mate implements Parcelable {
    private String _id;
    private String name;
    private String img;

    // Constructors, getters, and setters

    public Mate(String _id, String name, String img) {
        this._id = _id;
        this.name = name;
        this.img = img;
    }

    public String get_id() {
        return _id;
    }

    public void set_id(String _id) {
        this._id = _id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getImg() {
        return img;
    }

    public void setImg(String img) {
        this.img = img;
    }

    // Parcelable implementation

    protected Mate(Parcel in) {
        _id = in.readString();
        name = in.readString();
        img = in.readString();
    }

    @Override
    public void writeToParcel(Parcel dest, int flags) {
        dest.writeString(_id);
        dest.writeString(name);
        dest.writeString(img);
    }

    @Override
    public int describeContents() {
        return 0;
    }

    public static final Creator<Mate> CREATOR = new Creator<Mate>() {
        @Override
        public Mate createFromParcel(Parcel in) {
            return new Mate(in);
        }

        @Override
        public Mate[] newArray(int size) {
            return new Mate[size];
        }
    };
}
