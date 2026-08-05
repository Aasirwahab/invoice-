import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import UserEditProfile from "./UserEditProfile";
import { getAppUser } from "@/lib/currentUser";

export default async function UserProfile() {
  const user = await getAppUser();
  return (
    <Dialog>
      <DialogTrigger className="w-full text-left px-2 py-1 cursor-pointer hover:bg-muted-foreground/5">
        Profile
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Profile</DialogTitle>
          <DialogDescription>Edit your profile details here.</DialogDescription>
        </DialogHeader>

        {/**user profile display and editor */}
        <UserEditProfile
          firstName={user?.firstName}
          lastName={user?.lastName}
          currency={user?.currency}
          email={user?.email}
        />
      </DialogContent>
    </Dialog>
  );
}
