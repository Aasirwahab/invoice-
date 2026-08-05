import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SignOutButton } from "@clerk/nextjs";
import { getAppUser } from "@/lib/currentUser";
import getAvatarName from "@/lib/getAvatarName";
import { ChevronDown } from "lucide-react";
import UserProfile from "./UserProfile";

interface IUserProfileDropdown {
  isFullName: boolean;
  isArrowUp: boolean;
}

export default async function UserProfileDropDown({
  isFullName,
  isArrowUp,
}: IUserProfileDropdown) {
  const user = await getAppUser();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="flex items-center gap-3 cursor-pointer">
          <Avatar className="border size-9 bg-neutral-300 cursor-pointer">
            <AvatarImage src={user?.image as string} />
            <AvatarFallback>
              {getAvatarName(
                user?.firstName as string,
                user?.lastName as string
              )}
            </AvatarFallback>
          </Avatar>
          {isFullName && (
            <div>
              <p className="text-ellipsis line-clamp-1 font-medium">
                <span>{user?.firstName}</span>{" "}
                <span>{user?.lastName}</span>
              </p>
            </div>
          )}

          {isArrowUp && <ChevronDown className="transition-all ml-auto" />}
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-full min-w-[250px]">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/**user profile */}
        <UserProfile />
        <SignOutButton redirectUrl="/">
          <DropdownMenuItem className="bg-red-50 text-red-500 hover:bg-red-100 font-medium cursor-pointer">
            Logout
          </DropdownMenuItem>
        </SignOutButton>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
