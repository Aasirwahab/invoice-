import mongoose from "mongoose";

export interface IUser {
    _id? : mongoose.Types.ObjectId,
    /** Clerk's user id (user_xxx). The link between Clerk identity and app data. */
    clerkId : string;
    firstName : string;
    lastName : string;
    email : string;
    currency : string | null;
    createdAt? : Date;
    updatedAt? : Date;
}

const userSchema = new mongoose.Schema<IUser>({
     clerkId : { type : String, required : true, unique : true, index : true },
     firstName : { type : String, default : null },
     lastName : { type : String, default : null },
     email : { type : String, required : true },
     // null until the user finishes onboarding — this is what gates /onboarding
     currency : { type : String, default : null }
},{
    timestamps : true
})

const UserModel = mongoose.models.user || mongoose.model('user',userSchema)

export default UserModel
