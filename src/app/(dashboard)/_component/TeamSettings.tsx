"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import toast from "react-hot-toast";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type TRole = "OWNER" | "MANAGER" | "SALES" | "VIEWER";

const ASSIGNABLE: { value: TRole; label: string; hint: string }[] = [
  { value: "MANAGER", label: "Manager", hint: "Can change pricing and branding" },
  { value: "SALES", label: "Sales", hint: "Can create and edit invoices" },
  { value: "VIEWER", label: "Viewer", hint: "Read only" },
];

/**
 * Staff list and invites. Invites are created by email before the person has
 * an account — they are bound to a Clerk identity by orgs.claimInvite on that
 * person's first sign-in, so there is no dashboard work for the owner.
 */
export default function TeamSettings() {
  const membership = useQuery(api.orgs.current);
  const members = useQuery(api.orgs.listMembers);
  const inviteMember = useMutation(api.orgs.inviteMember);
  const updateMemberRole = useMutation(api.orgs.updateMemberRole);
  const setMemberStatus = useMutation(api.orgs.setMemberStatus);

  const [email, setEmail] = useState<string>("");
  const [role, setRole] = useState<TRole>("SALES");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const isOwner = membership?.member.role === "OWNER";

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      const result = await inviteMember({
        email,
        role: role as "MANAGER" | "SALES" | "VIEWER",
      });
      toast.success(result.message);
      setEmail("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleRoleChange = async (memberId: Id<"members">, next: TRole) => {
    try {
      await updateMemberRole({ memberId, role: next });
      toast.success("Role updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong"
      );
    }
  };

  const handleStatusToggle = async (
    memberId: Id<"members">,
    next: "ACTIVE" | "DISABLED"
  ) => {
    try {
      await setMemberStatus({ memberId, status: next });
      toast.success(next === "ACTIVE" ? "Member enabled" : "Member disabled");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong"
      );
    }
  };

  if (!isOwner) {
    return (
      <p className="text-sm text-muted-foreground">
        Only an owner can manage the team.
      </p>
    );
  }

  return (
    <div className="grid gap-6">
      <form className="grid gap-2 max-w-md" onSubmit={handleInvite}>
        <Input
          type="email"
          placeholder="colleague@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isLoading}
        />
        <Select
          value={role}
          onValueChange={(value) => setRole(value as TRole)}
          disabled={isLoading}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            {ASSIGNABLE.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label} — {option.hint}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="w-fit" disabled={isLoading}>
          {isLoading ? "Please wait..." : "Send invite"}
        </Button>
      </form>

      <div className="grid gap-2">
        {members === undefined && (
          <p className="text-sm text-muted-foreground">Loading team...</p>
        )}
        {members?.map((member) => (
          <div
            key={member._id}
            className="flex flex-wrap items-center justify-between gap-3 border rounded-lg p-3"
          >
            <div className="grid">
              <p className="text-sm font-medium">{member.email}</p>
              <p className="text-xs text-muted-foreground">
                {member.status === "INVITED"
                  ? "Invite pending — joins on first sign-in"
                  : member.status === "DISABLED"
                    ? "Disabled"
                    : "Active"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={member.role}
                onValueChange={(value) =>
                  handleRoleChange(member._id, value as TRole)
                }
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OWNER">Owner</SelectItem>
                  {ASSIGNABLE.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  handleStatusToggle(
                    member._id,
                    member.status === "DISABLED" ? "ACTIVE" : "DISABLED"
                  )
                }
              >
                {member.status === "DISABLED" ? "Enable" : "Disable"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
