#include <stdio.h>
#include <stdlib.h>
#include <time.h>

#ifdef _WIN32
#include <windows.h>
#endif

int main(void) {
    int secret, guess;
    int count = 0;

#ifdef _WIN32
    /* 源码按 UTF-8 存，gcc 把字节原样编进 exe；
       Windows 控制台默认按 936(GBK) 解，中文会变乱码。
       这里让控制台也按 UTF-8 解，两边就对上了。 */
    SetConsoleOutputCP(CP_UTF8);
#endif

    /* time(NULL) 每次运行都不同，拿它当种子，
       否则 rand() 每次给同一串数，猜一次就摸清了。 */
    srand((unsigned)time(NULL));
    secret = rand() % 100 + 1;  /* 1 到 100 之间随便挑一个 */

    printf("我心里想了个 1 到 100 之间的数，你猜猜看\n");

    while (1) {                 /* 一直转，直到你猜中才停 */
        printf("你猜：");
        /* scanf 返回成功读到的项数；读到非数字或 EOF 就退出，
           否则 guess 保持旧值，循环会空转不停刷屏。 */
        if (scanf("%d", &guess) != 1) {
            printf("这不是个数，下次再来吧。\n");
            break;
        }
        count++;

        if (guess > secret) {
            printf("大了点，往小里猜。\n");
        } else if (guess < secret) {
            printf("小了点，往大里猜。\n");
        } else {
            printf("猜中啦！你用了 %d 次。\n", count);
            break;
        }
    }

    return 0;
}
