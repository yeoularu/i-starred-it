import { GitHubIcon } from "./github-icon";
import { ModeToggle } from "./mode-toggle";
import { buttonVariants } from "./ui/button";

export default function Header() {
  return (
    <div>
      <div className="mx-auto flex max-w-[96rem] flex-row items-center justify-between px-2 py-1">
        <div className="flex items-center gap-2">
          <img
            alt="Logo"
            className="ml-2 size-6 rounded"
            height={24}
            src="/logo.png"
            width={24}
          />
          <h1 className="font-medium text-lg">I Starred It</h1>
        </div>

        <div className="flex items-center gap-2">
          <ModeToggle />

          <a
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            href="https://github.com/yeoularu/i-starred-it"
          >
            <GitHubIcon />
          </a>
        </div>
      </div>
    </div>
  );
}
