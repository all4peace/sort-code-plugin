using System;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/", () => Results.Ok(new { message = "hi" }));

if (args.Length > 0)
{
    Console.WriteLine(args[0]);
}

app.Run();

void LocalHelper() { }

public partial class Program
{
    public static string Zed() => "z";
    public static string Alpha() => "a";
}

public record Settings(string Name);
