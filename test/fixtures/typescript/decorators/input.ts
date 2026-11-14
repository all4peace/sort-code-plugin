import { Component, Input, Output, EventEmitter, HostListener } from "@angular/core";

@Component({ selector: "app-card", template: "<div></div>" })
export class CardComponent {
  @Output() closed = new EventEmitter<void>();
  @Input() title = "";

  @HostListener("window:resize")
  onResize(): void {}

  ngOnInit(): void {}

  constructor(private readonly service: CardService) {}

  private reset(): void {}

  @Input()
  set subtitle(value: string) {
    this.sub = value;
  }

  private sub = "";
}

class CardService {}
